import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'parse5'
import { collectFiles, findArtifact, isMainModule, loadMarkdownPages, readSiteMetadata, relativeUrlPath } from './build-utils.mjs'
import { postprocessFeeds } from './postprocess-feeds.mjs'

export function setHtmlLanguage(source, language) {
  if (!/^[a-z\d-]+$/i.test(language))
    throw new Error(`Invalid HTML language: ${language}`)
  return source.replace(/<html\b[^>]*>/i, (tag) => {
    if (/\slang\s*=/i.test(tag))
      return tag.replace(/\slang\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ` lang="${language}"`)
    return tag.replace(/>$/, ` lang="${language}">`)
  })
}

export function normalizeCssPreloadCredentials(source) {
  const document = parse(source, { sourceCodeLocationInfo: true })
  const groups = new Map()
  function visit(node) {
    if (node.tagName === 'link') {
      const attrs = new Map((node.attrs || []).map(attr => [attr.name, attr.value]))
      const href = attrs.get('href') || ''
      const rel = (attrs.get('rel') || '').toLowerCase().split(/\s+/)
      const preload = rel.includes('preload') && attrs.get('as')?.toLowerCase() === 'style'
      const stylesheet = rel.includes('stylesheet')
      // Only normalize matching generated CSS chunks, leaving external/custom links alone.
      if (/^\/assets\/[^?#]+\.css(?:[?#]|$)/i.test(href) && (preload || stylesheet)) {
        const group = groups.get(href) || { preloads: [], stylesheets: [] }
        const entry = { node, attrs }
        if (preload)
          group.preloads.push(entry)
        if (stylesheet)
          group.stylesheets.push(entry)
        groups.set(href, group)
      }
    }
    for (const child of node.childNodes || [])
      visit(child)
    if (node.content)
      visit(node.content)
  }
  visit(document)

  const edits = []
  for (const group of groups.values()) {
    if (!group.preloads.length || !group.stylesheets.length)
      continue
    const entries = [...new Set([...group.preloads, ...group.stylesheets])]
    const explicitModes = new Set(entries.filter(entry => entry.attrs.has('crossorigin')).map(entry => entry.attrs.get('crossorigin').toLowerCase() === 'use-credentials' ? 'use-credentials' : 'anonymous'))
    // Preserve explicit user choices rather than overriding contradictory attributes.
    if (explicitModes.size !== 1)
      continue
    const attribute = explicitModes.has('use-credentials') ? ' crossorigin="use-credentials"' : ' crossorigin'
    for (const entry of entries) {
      if (entry.attrs.has('crossorigin') || !entry.node.sourceCodeLocation?.startTag)
        continue
      let offset = entry.node.sourceCodeLocation.startTag.endOffset - 1
      if (source[offset - 1] === '/')
        offset--
      edits.push({ offset, attribute })
    }
  }
  // Insert attributes without reserializing styles, scripts, entities or unrelated markup.
  for (const edit of edits.sort((left, right) => right.offset - left.offset))
    source = source.slice(0, edit.offset) + edit.attribute + source.slice(edit.offset)
  return source
}

export async function postprocessBuild(projectRoot = process.cwd()) {
  const metadata = await readSiteMetadata(projectRoot)
  const pages = await loadMarkdownPages(projectRoot)
  const dist = resolve(projectRoot, 'dist')
  const htmlFiles = (await collectFiles(dist)).filter(filename => filename.endsWith('.html'))
  const artifacts = new Set(htmlFiles.map(filename => relativeUrlPath(dist, filename)))
  const languages = new Map(pages.filter(page => !page.data.draft && page.data.lang).map(page => [findArtifact(page.route, artifacts), page.data.lang]))
  let processed = 0
  for (const filepath of htmlFiles) {
    const source = await readFile(filepath, 'utf8')
    // Public standalone HTML demos have their own language and are not Valaxy pages.
    if (!source.includes('__INITIAL_STATE__'))
      continue
    const updated = normalizeCssPreloadCredentials(setHtmlLanguage(source, languages.get(relativeUrlPath(dist, filepath)) || metadata.lang))
    if (updated !== source)
      await writeFile(filepath, updated, 'utf8')
    processed++
  }
  const feeds = await postprocessFeeds(projectRoot, { metadata, pages })
  return { pages: processed, feeds }
}

if (isMainModule(import.meta.url)) {
  postprocessBuild().then(result => console.log(`Normalized HTML language in ${result.pages} pages and article links/dates in ${result.feeds} feeds.`)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
