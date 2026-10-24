import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { parse, parseFragment } from 'parse5'

export function isMainModule(url) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === url
}

export async function collectFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = resolve(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await collectFiles(filename))
    else if (entry.isFile())
      files.push(filename)
  }
  return files
}

export function relativeUrlPath(root, filename) {
  return `/${relative(root, filename).split(sep).join('/')}`
}

export function markdownRoute(filename) {
  let route = `/${filename.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\.md$/, '')}`
  route = route.replace(/\/index$/, '')
  return route || '/'
}

export function dateToIso(value) {
  if (!(value instanceof Date) && typeof value !== 'string')
    return null
  if (typeof value === 'string' && !value.trim())
    return null
  if (typeof value === 'string') {
    const calendar = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (calendar) {
      const [, yearText, monthText, dayText] = calendar
      const year = Number(yearText)
      const month = Number(monthText)
      const day = Number(dayText)
      const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
      if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1])
        return null
    }
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function readSiteMetadata(projectRoot = process.cwd()) {
  const source = await readFile(resolve(projectRoot, 'site.config.ts'), 'utf8')
  // These are literal properties in this project's config. Fail explicitly if that changes.
  const siteUrl = source.match(/^\s*url:\s*(['"])(.*?)\1\s*,?\s*$/m)?.[2]
  const lang = source.match(/^\s*lang:\s*(['"])(.*?)\1\s*,?\s*$/m)?.[2]
  if (!siteUrl || !lang)
    throw new Error('Expected literal url and lang properties in site.config.ts.')
  const url = new URL(siteUrl)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('site.config.ts url must be an HTTP(S) URL.')
  return { siteUrl: url.href, lang, hostname: url.hostname }
}

export async function loadMarkdownPages(projectRoot = process.cwd()) {
  const pagesRoot = resolve(projectRoot, 'pages')
  const filenames = (await collectFiles(pagesRoot)).filter(filename => filename.endsWith('.md'))
  const pages = []
  for (const filename of filenames) {
    const source = await readFile(filename, 'utf8')
    const { data, content } = matter(source)
    const relativePath = relative(pagesRoot, filename).split(sep).join('/')
    pages.push({ filename, relativePath, route: markdownRoute(relativePath), data, content })
  }
  return pages
}

export function artifactCandidates(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  }
  catch {
    throw new Error(`Malformed URL encoding: ${pathname}`)
  }
  if (!decoded.startsWith('/') || /[\0\\]/.test(decoded) || decoded.split('/').includes('..'))
    throw new Error(`Invalid local URL path: ${pathname}`)
  const clean = decoded.replace(/\/+$/, '')
  if (!clean)
    return ['/index.html']
  return [...new Set([decoded, clean, `${clean}.html`, `${clean}/index.html`])]
}

export function findArtifact(pathname, artifactPaths) {
  return artifactCandidates(pathname).find(candidate => artifactPaths.has(candidate)) || null
}

export function localReference(value, basePath, siteUrl) {
  const reference = value.trim()
  if (!reference || /^(?:data|mailto|tel|javascript|blob|about):/i.test(reference))
    return null
  const site = new URL(siteUrl)
  let url
  try {
    url = new URL(reference, new URL(basePath, site))
  }
  catch {
    throw new Error(`Invalid URL: ${reference}`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.host !== site.host)
    return null
  return { pathname: url.pathname, hash: url.hash, url: url.href }
}

export function htmlDocument(source, { fragment = false } = {}) {
  const document = (fragment ? parseFragment : parse)(source, { sourceCodeLocationInfo: true })
  const links = []
  const ids = new Set()
  const katexErrors = []
  let lang
  function visit(node) {
    const attrs = new Map((node.attrs || []).map(attr => [attr.name, attr.value]))
    if (node.tagName === 'html')
      lang = attrs.get('lang')
    if (attrs.has('id'))
      ids.add(attrs.get('id'))
    if (node.tagName === 'a' && attrs.has('name'))
      ids.add(attrs.get('name'))
    if ((attrs.get('class') || '').split(/\s+/).includes('katex-error'))
      katexErrors.push(attrs.get('title') || 'Invalid KaTeX formula')
    for (const attr of node.attrs || []) {
      if (!['href', 'src', 'poster'].includes(attr.name))
        continue
      links.push({ value: attr.value, attribute: attr.name, line: node.sourceCodeLocation?.attrs?.[attr.name]?.startLine || 1 })
    }
    for (const child of node.childNodes || [])
      visit(child)
    if (node.content)
      visit(node.content)
  }
  visit(document)
  return { links, ids, lang, katexErrors, isSsg: source.includes('__INITIAL_STATE__') }
}

export function servedHtmlPath(artifactPath, isSsg) {
  if (artifactPath === '/index.html')
    return '/'
  if (artifactPath.endsWith('/index.html'))
    return artifactPath.slice(0, -'index.html'.length)
  return isSsg ? artifactPath.replace(/\.html$/, '') : artifactPath
}
