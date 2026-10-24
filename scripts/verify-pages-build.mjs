import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  collectFiles,
  dateToIso,
  findArtifact,
  htmlDocument,
  isMainModule,
  loadMarkdownPages,
  localReference,
  readSiteMetadata,
  relativeUrlPath,
  servedHtmlPath,
} from './build-utils.mjs'
import { feedEntries, normalizeIndexUrl } from './postprocess-feeds.mjs'

export async function verifyBuild(projectRoot = process.cwd()) {
  const root = resolve(projectRoot, 'dist')
  const metadata = await readSiteMetadata(projectRoot)
  const pages = await loadMarkdownPages(projectRoot)
  const files = await collectFiles(root)
  const artifacts = new Map(files.map(filename => [relativeUrlPath(root, filename), filename]))
  const failures = new Set()
  const fail = message => failures.add(message)
  const documents = new Map()
  const htmlSources = new Map()
  let localReferences = 0
  let checkedFeedEntries = 0

  for (const [artifact, filename] of artifacts) {
    if (!artifact.endsWith('.html'))
      continue
    const source = await readFile(filename, 'utf8')
    htmlSources.set(artifact, source)
    documents.set(artifact, htmlDocument(source))
  }

  for (const required of ['/index.html', '/404.html', '/CNAME']) {
    if (!artifacts.has(required))
      fail(`${required.slice(1)} is missing`)
  }
  const index = htmlSources.get('/index.html')
  if (index != null) {
    if (Buffer.byteLength(index) < 10_000 || !documents.get('/index.html').isSsg)
      fail('index.html is an unrendered Vite shell, not an SSG page')
    if (!index.includes('</html>'))
      fail('index.html is incomplete')
  }
  if (htmlSources.has('/404.html') && !htmlSources.get('/404.html').includes('/assets/'))
    fail('404.html cannot bootstrap the blog application')
  if (artifacts.has('/CNAME')) {
    const cname = (await readFile(artifacts.get('/CNAME'), 'utf8')).trim()
    if (cname !== metadata.hostname)
      fail(`CNAME contains "${cname}" instead of "${metadata.hostname}"`)
  }
  if (![...artifacts.keys()].some(filename => /^\/assets\/.+\.js$/.test(filename)))
    fail('No generated JavaScript assets were found')
  if (![...artifacts.keys()].some(filename => /^\/assets\/.+\.css$/.test(filename)))
    fail('No generated CSS assets were found')

  const published = pages.filter(page => !page.data.draft)
  const languages = new Map()
  for (const page of published) {
    const artifact = findArtifact(page.route, artifacts)
    if (!artifact)
      fail(`${page.relativePath}: no generated HTML for ${page.route}`)
    else if (!documents.get(artifact)?.isSsg)
      fail(`${page.relativePath}: ${artifact} is not a rendered SSG page`)
    else
      languages.set(artifact, page.data.lang || metadata.lang)
    if (!page.route.startsWith('/posts/'))
      continue
    if (typeof page.data.title !== 'string' || !page.data.title.trim())
      fail(`${page.relativePath}: missing article title`)
    const date = dateToIso(page.data.date)
    const updated = dateToIso(page.data.updated ?? page.data.date)
    if (!date)
      fail(`${page.relativePath}: missing or invalid publication date`)
    if (!updated)
      fail(`${page.relativePath}: invalid update date`)
    if (date && updated && updated < date)
      fail(`${page.relativePath}: updated precedes the publication date`)
  }

  const pagination = new Set()
  function checkLinks(links, basePath, location) {
    for (const link of links) {
      let reference
      try {
        reference = localReference(link.value, basePath, metadata.siteUrl)
      }
      catch (error) {
        fail(`${location}:${link.line}: ${error.message}`)
        continue
      }
      if (!reference)
        continue
      localReferences++
      if (/^\/page\/\d+\/?$/.test(reference.pathname))
        pagination.add(reference.pathname.replace(/\/$/, ''))
      let target
      try {
        target = findArtifact(reference.pathname, artifacts)
      }
      catch (error) {
        fail(`${location}:${link.line}: ${error.message}`)
        continue
      }
      if (!target) {
        fail(`${location}:${link.line}: missing local ${link.attribute} target ${link.value}`)
        continue
      }
      if (!reference.hash || !documents.has(target))
        continue
      let id
      try {
        id = decodeURIComponent(reference.hash.slice(1)).split(':~:text=')[0]
      }
      catch {
        fail(`${location}:${link.line}: malformed fragment ${link.value}`)
        continue
      }
      if (id && id !== 'top' && !documents.get(target).ids.has(id))
        fail(`${location}:${link.line}: missing anchor #${id} in ${target}`)
    }
  }

  for (const [artifact, document] of documents) {
    if (document.isSsg && document.lang !== (languages.get(artifact) || metadata.lang))
      fail(`${artifact.slice(1)}: expected HTML lang="${languages.get(artifact) || metadata.lang}", found "${document.lang}"`)
    for (const error of document.katexErrors)
      fail(`${artifact.slice(1)}: KaTeX error: ${error}`)
    checkLinks(document.links, servedHtmlPath(artifact, document.isSsg), artifact.slice(1))
  }
  const lastPage = Math.max(1, ...[...pagination].map(route => Number(route.split('/').at(-1))))
  for (let page = 2; page <= lastPage; page++) {
    const route = `/page/${page}`
    const artifact = findArtifact(route, artifacts)
    if (!artifact || !documents.get(artifact)?.isSsg)
      fail(`${route}: missing rendered pagination page; check vite.ssgOptions.includedRoutes`)
  }

  const posts = published.filter(page => page.route.startsWith('/posts/') && !page.data.hide && !page.data.password)
  const postsByRoute = new Map(posts.map(page => [page.route, page]))
  const normalization = { siteUrl: metadata.siteUrl, routes: new Set(published.map(page => page.route)) }
  for (const [filename, format] of [['feed.json', 'json'], ['feed.xml', 'rss'], ['atom.xml', 'atom']]) {
    const artifact = `/${filename}`
    if (!artifacts.has(artifact)) {
      fail(`${filename} is missing`)
      continue
    }
    let entries
    try {
      entries = feedEntries(await readFile(artifacts.get(artifact), 'utf8'), format)
    }
    catch (error) {
      fail(`${filename}: invalid feed: ${error.message}`)
      continue
    }
    const routes = new Set()
    for (const entry of entries) {
      checkedFeedEntries++
      if (!entry.url) {
        fail(`${filename}: article is missing its URL`)
        continue
      }
      const reference = localReference(entry.url, '/', metadata.siteUrl)
      if (!reference) {
        fail(`${filename}: unexpected external article URL ${entry.url}`)
        continue
      }
      const route = decodeURIComponent(reference.pathname).replace(/\/$/, '') || '/'
      if (routes.has(route))
        fail(`${filename}: duplicate article URL ${entry.url}`)
      routes.add(route)
      if (normalizeIndexUrl(entry.url, normalization) !== entry.url)
        fail(`${filename}: noncanonical /index article URL ${entry.url}`)
      checkLinks([{ value: entry.url, attribute: 'article URL', line: 1 }], '/', filename)
      checkLinks(htmlDocument(entry.html, { fragment: true }).links, entry.url, filename)
      const post = postsByRoute.get(route)
      if (!post) {
        fail(`${filename}: article URL does not match a published post: ${entry.url}`)
        continue
      }
      if (dateToIso(entry.published) !== dateToIso(post.data.date))
        fail(`${filename}: publication date differs from frontmatter for ${route}`)
      if (format !== 'rss' && dateToIso(entry.modified) !== dateToIso(post.data.updated ?? post.data.date))
        fail(`${filename}: update date differs from frontmatter for ${route}`)
    }
    for (const route of postsByRoute.keys()) {
      if (!routes.has(route))
        fail(`${filename}: published post is absent from the feed: ${route}`)
    }
  }
  return {
    failures: [...failures],
    htmlFiles: documents.size,
    markdownPages: published.length,
    localReferences,
    paginationPages: lastPage,
    feedEntries: checkedFeedEntries,
  }
}

if (isMainModule(import.meta.url)) {
  verifyBuild().then((result) => {
    if (result.failures.length) {
      console.error(`GitHub Pages verification failed (${result.failures.length} issues):`)
      result.failures.slice(0, 100).forEach(failure => console.error(`- ${failure}`))
      if (result.failures.length > 100)
        console.error(`- ${result.failures.length - 100} additional issues omitted`)
      process.exitCode = 1
      return
    }
    console.log(`Verified ${result.htmlFiles} HTML files, ${result.markdownPages} Markdown pages, ${result.paginationPages} pagination pages, ${result.localReferences} local references and ${result.feedEntries} feed entries.`)
  }).catch((error) => {
    console.error(`GitHub Pages verification could not complete: ${error.message}`)
    process.exitCode = 1
  })
}
