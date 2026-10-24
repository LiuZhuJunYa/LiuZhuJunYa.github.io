import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import MarkdownIt from 'markdown-it'
import markdownItContainer from 'markdown-it-container'
import { parseFragment, serialize } from 'parse5'
import xml from 'xml-js'
import { dateToIso, isMainModule, loadMarkdownPages, readSiteMetadata } from './build-utils.mjs'

const summaryMarkdown = new MarkdownIt({ html: true, linkify: false })
for (const name of ['definition', 'theorem', 'algorithm', 'conclusion', 'tip', 'info', 'warning', 'danger', 'details', 'code-group'])
  summaryMarkdown.use(markdownItContainer, name)

const excludedSummaryTags = new Set(['iframe', 'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'pre'])
const summaryBlockTags = new Set(['p', 'div', 'blockquote', 'section', 'article', 'li', 'ul', 'ol', 'table', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr'])

export function postSummaryText(post, limit = 220) {
  const manual = typeof post.data.excerpt === 'string' ? post.data.excerpt.trim() : ''
  if (!manual && typeof post.content !== 'string')
    return null
  const fragment = parseFragment(summaryMarkdown.render(manual || post.content))
  const parts = []
  function visit(node) {
    if (excludedSummaryTags.has(node.tagName))
      return
    if (summaryBlockTags.has(node.tagName))
      parts.push(' ')
    if (node.nodeName === '#text')
      parts.push(node.value)
    for (const child of node.childNodes || [])
      visit(child)
    if (summaryBlockTags.has(node.tagName))
      parts.push(' ')
  }
  visit(fragment)
  const text = parts.join('').replace(/\s+/gu, ' ').trim() || post.data.title || ''
  const characters = Array.from(text)
  return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : text
}

export function normalizeIndexUrl(value, { siteUrl, routes, baseUrl = siteUrl }) {
  if (typeof value !== 'string' || !value.trim())
    return value
  let url
  try {
    url = new URL(value, baseUrl)
  }
  catch {
    return value
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.host !== new URL(siteUrl).host)
    return value
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  }
  catch {
    return value
  }
  if (!/\/index\/?$/.test(pathname))
    return value
  const canonical = pathname.replace(/\/index\/?$/, '') || '/'
  if (!routes.has(canonical))
    return value
  // The decoded route can contain a literal "%" (including names such as "%20").
  // Encode each path segment again so it cannot become a different URL on output.
  url.pathname = canonical.split('/').map(encodeURIComponent).join('/')
  if (/^[a-z][a-z\d+.-]*:/i.test(value))
    return url.href
  if (value.startsWith('//'))
    return `//${url.host}${url.pathname}${url.search}${url.hash}`
  return `${url.pathname}${url.search}${url.hash}`
}

export function normalizeFeedHtml(source, options) {
  const fragment = parseFragment(source)
  function visit(node) {
    for (const attr of node.attrs || []) {
      if (['href', 'src'].includes(attr.name))
        attr.value = normalizeIndexUrl(attr.value, options)
    }
    if (node.nodeName === '#text' && /^\s*https?:\/\/\S+\s*$/.test(node.value)) {
      const trimmed = node.value.trim()
      node.value = node.value.replace(trimmed, normalizeIndexUrl(trimmed, options))
    }
    for (const child of node.childNodes || [])
      visit(child)
    if (node.content)
      visit(node.content)
  }
  visit(fragment)
  return serialize(fragment)
}

function sourcePost(value, options) {
  try {
    const url = new URL(value, options.siteUrl)
    if (url.host !== new URL(options.siteUrl).host)
      return null
    return options.postsByRoute?.get(decodeURIComponent(url.pathname).replace(/\/$/, '') || '/')
  }
  catch {
    return null
  }
}

function summaryHtml(value, options) {
  const post = sourcePost(value, options)
  if (!post)
    return null
  let text = options.summaryCache?.get(post)
  if (text === undefined) {
    text = postSummaryText(post)
    options.summaryCache?.set(post, text)
  }
  if (text === null)
    return null
  const language = post.data.lang || options.lang || 'zh-CN'
  const label = language.startsWith('zh') ? '阅读全文' : 'Read the full article'
  const href = new URL(value, options.siteUrl).href
  return `<p>${summaryMarkdown.utils.escapeHtml(text)}</p>\n<p><a href="${summaryMarkdown.utils.escapeHtml(href)}">${label}</a></p>`
}

function feedDates(value, options) {
  const post = sourcePost(value, options)
  if (!post)
    return null
  const published = dateToIso(post.data.date)
  const modified = dateToIso(post.data.updated ?? post.data.date)
  return published && modified ? { published, modified } : null
}

function array(value) {
  return value == null ? [] : Array.isArray(value) ? value : [value]
}

function xmlText(node) {
  return node?._text ?? node?._cdata ?? ''
}

function setXmlText(node, value) {
  if (!node)
    return
  if ('_cdata' in node)
    node._cdata = value
  else
    node._text = value
}

export function normalizeFeed(source, format, options) {
  const transform = value => normalizeIndexUrl(value, options)
  if (format === 'json') {
    const feed = JSON.parse(source)
    for (const item of feed.items || []) {
      for (const key of ['url', 'id', 'external_url']) {
        if (typeof item[key] === 'string')
          item[key] = transform(item[key])
      }
      const summary = summaryHtml(item.url, options)
      if (summary !== null)
        item.content_html = summary
      else if (item.content_html)
        item.content_html = normalizeFeedHtml(item.content_html, { ...options, baseUrl: item.url || options.siteUrl })
      const dates = feedDates(item.url, options)
      if (dates) {
        item.date_published = dates.published
        item.date_modified = dates.modified
      }
    }
    return `${JSON.stringify(feed, null, 4)}\n`
  }

  const feed = xml.xml2js(source, { compact: true })
  const entries = format === 'atom' ? array(feed.feed?.entry) : array(feed.rss?.channel?.item)
  for (const entry of entries) {
    let link
    if (format === 'atom') {
      for (const node of array(entry.link)) {
        if (node._attributes?.href) {
          node._attributes.href = transform(node._attributes.href)
          if (!node._attributes.rel || node._attributes.rel === 'alternate')
            link = node._attributes.href
        }
      }
      if (entry.id)
        setXmlText(entry.id, transform(xmlText(entry.id)))
    }
    else {
      if (entry.link)
        setXmlText(entry.link, transform(xmlText(entry.link)))
      if (entry.guid)
        setXmlText(entry.guid, transform(xmlText(entry.guid)))
      link = xmlText(entry.link)
    }
    const content = format === 'atom' ? entry.content : entry['content:encoded']
    const summary = summaryHtml(link, options)
    if (summary !== null) {
      if (format === 'atom')
        entry.content = { _attributes: { type: 'html' }, _cdata: summary }
      else
        entry['content:encoded'] = { _cdata: summary }
    }
    else if (content) {
      setXmlText(content, normalizeFeedHtml(xmlText(content), { ...options, baseUrl: link || options.siteUrl }))
    }
    const dates = feedDates(link, options)
    if (dates && format === 'atom') {
      entry.published = { _text: dates.published }
      entry.updated = { _text: dates.modified }
    }
    else if (dates) {
      entry.pubDate = { _text: new Date(dates.published).toUTCString() }
    }
  }
  return `${xml.js2xml(feed, { compact: true, spaces: 4 })}\n`
}

export function feedEntries(source, format) {
  if (format === 'json') {
    return (JSON.parse(source).items || []).map(item => ({ url: item.url, html: item.content_html || '', published: item.date_published, modified: item.date_modified }))
  }
  const feed = xml.xml2js(source, { compact: true })
  if (format === 'atom') {
    return array(feed.feed?.entry).map(entry => ({
      url: array(entry.link).find(node => !node._attributes?.rel || node._attributes.rel === 'alternate')?._attributes?.href,
      html: xmlText(entry.content),
      published: xmlText(entry.published),
      modified: xmlText(entry.updated),
    }))
  }
  return array(feed.rss?.channel?.item).map(entry => ({ url: xmlText(entry.link), html: xmlText(entry['content:encoded']), published: xmlText(entry.pubDate) }))
}

export async function postprocessFeeds(projectRoot = process.cwd(), context = {}) {
  const metadata = context.metadata || await readSiteMetadata(projectRoot)
  const pages = context.pages || await loadMarkdownPages(projectRoot)
  const published = pages.filter(page => !page.data.draft)
  const options = {
    siteUrl: metadata.siteUrl,
    lang: metadata.lang,
    routes: new Set(published.map(page => page.route)),
    postsByRoute: new Map(published.filter(page => page.route.startsWith('/posts/')).map(page => [page.route, page])),
    summaryCache: new Map(),
  }
  let processed = 0
  for (const directory of ['dist', 'public']) {
    for (const [filename, format] of [['feed.json', 'json'], ['feed.xml', 'rss'], ['atom.xml', 'atom']]) {
      const filepath = resolve(projectRoot, directory, filename)
      let source
      try {
        source = await readFile(filepath, 'utf8')
      }
      catch (error) {
        if (error.code === 'ENOENT')
          continue
        throw error
      }
      const updated = normalizeFeed(source, format, options)
      if (updated !== source)
        await writeFile(filepath, updated, 'utf8')
      processed++
    }
  }
  if (!processed)
    throw new Error('No generated feeds found. Run the Valaxy build or RSS command first.')
  return processed
}

if (isMainModule(import.meta.url)) {
  postprocessFeeds().then(count => console.log(`Normalized article links and dates in ${count} generated feeds.`)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
