import assert from 'node:assert/strict'
import test from 'node:test'
import {
  artifactCandidates,
  dateToIso,
  findArtifact,
  htmlDocument,
  localReference,
  markdownRoute,
} from '../scripts/build-utils.mjs'
import { feedEntries, normalizeFeed, normalizeIndexUrl, postSummaryText } from '../scripts/postprocess-feeds.mjs'
import { normalizeCssPreloadCredentials, setHtmlLanguage } from '../scripts/postprocess-build.mjs'

const siteUrl = 'https://blog.example/'
const route = '/posts/学习工作区'
const sourcePost = { data: { date: '2026-09-01', updated: '2026-09-03' } }
const options = { siteUrl, routes: new Set([route, '/posts/plain']), postsByRoute: new Map([[route, sourcePost]]) }
const oldUrl = `${siteUrl.slice(0, -1)}${route}/index`
const canonical = `${siteUrl.slice(0, -1)}${encodeURI(route)}`

test('Markdown routes match directory index pages without changing case-sensitive filenames', () => {
  assert.equal(markdownRoute('index.md'), '/')
  assert.equal(markdownRoute('posts\\学习工作区\\index.md'), route)
  assert.equal(markdownRoute('posts/Index.md'), '/posts/Index')
  assert.equal(markdownRoute('posts/20261024 hello.md'), '/posts/20261024 hello')
})

test('Frontmatter dates reject compact numeric dates instead of treating them as 1970 timestamps', () => {
  assert.equal(dateToIso(20250618), null)
  assert.equal(dateToIso(1750204800000), null)
  assert.equal(dateToIso('20250618'), null)
  assert.equal(dateToIso('2025-06-18'), '2025-06-18T00:00:00.000Z')
  assert.equal(dateToIso(new Date('2025-06-18')), '2025-06-18T00:00:00.000Z')
})

test('Calendar validation rejects overflow dates while preserving ISO datetimes and RSS dates', () => {
  for (const invalid of ['2025-02-29', '2026-02-31', '1900-02-29', '2026-04-31T12:00:00Z', '2026-00-10', '2026-12-00'])
    assert.equal(dateToIso(invalid), null, invalid)
  assert.equal(dateToIso('2024-02-29'), '2024-02-29T00:00:00.000Z')
  assert.equal(dateToIso('2000-02-29T12:00:00Z'), '2000-02-29T12:00:00.000Z')
  assert.equal(dateToIso('2024-02-29T23:00:00-08:00'), '2024-03-01T07:00:00.000Z')
  assert.equal(dateToIso('Tue, 01 Sep 2026 00:00:00 GMT'), '2026-09-01T00:00:00.000Z')
})

test('Artifact lookup handles encoded routes, flat HTML and directory indexes with exact case', () => {
  const files = new Set(['/posts/学习工作区.html', '/posts/with-dir/index.html', '/assets/chart.PNG'])
  assert.equal(findArtifact(encodeURI(route), files), `${route}.html`)
  assert.equal(findArtifact('/posts/with-dir/', files), '/posts/with-dir/index.html')
  assert.equal(findArtifact('/assets/chart.PNG', files), '/assets/chart.PNG')
  assert.equal(findArtifact('/assets/chart.png', files), null)
  assert.deepEqual(artifactCandidates('/'), ['/index.html'])
  assert.throws(() => artifactCandidates('/broken%encoding'))
  assert.throws(() => artifactCandidates('/%2e%2e/private.txt'))
  assert.throws(() => artifactCandidates('/posts/%5csecret'))
})

test('Local URL parsing keeps queries and fragments separate from filenames', () => {
  const ref = localReference('./image.png?v=2#caption', '/posts/article', siteUrl)
  assert.equal(ref.pathname, '/posts/image.png')
  assert.equal(ref.hash, '#caption')
  assert.equal(localReference('https://other.example/missing', '/', siteUrl), null)
  assert.equal(localReference('//other.example/missing', '/', siteUrl), null)
  assert.equal(localReference('data:image/png;base64,abc', '/', siteUrl), null)
  assert.equal(localReference('mailto:author@example.com', '/', siteUrl), null)
  assert.equal(localReference('/feed.xml?format=rss', '/', siteUrl).pathname, '/feed.xml')
})

test('HTML inspection decodes attributes and finds real anchors and KaTeX failures', () => {
  const doc = htmlDocument('<html lang="zh-CN"><body><h2 id="章节">Heading</h2><a href="/posts/a?x=1&amp;y=2#章节">Link</a><img src="/assets/a.png"><span class="math katex-error" title="Unknown command"></span><script>const sample = \'<a href="/not-a-link">\'</script></body></html>')
  assert.equal(doc.lang, 'zh-CN')
  assert.equal(doc.links.length, 2)
  assert.equal(doc.links[0].value, '/posts/a?x=1&y=2#章节')
  assert.ok(doc.ids.has('章节'))
  assert.deepEqual(doc.katexErrors, ['Unknown command'])
})

test('Feed canonicalization changes only known same-site directory index routes', () => {
  assert.equal(normalizeIndexUrl(`${oldUrl}?x=1#section`, options), `${canonical}?x=1#section`)
  assert.equal(normalizeIndexUrl(`${route}/index`, options), encodeURI(route))
  assert.equal(normalizeIndexUrl('/posts/unknown/index', options), '/posts/unknown/index')
  assert.equal(normalizeIndexUrl('/posts/plain/index.html', options), '/posts/plain/index.html')
  assert.equal(normalizeIndexUrl('https://other.example/posts/plain/index', options), 'https://other.example/posts/plain/index')
  assert.equal(normalizeIndexUrl('mailto:author@example.com', options), 'mailto:author@example.com')
})

test('Feed route normalization preserves literal percent signs and encoded-looking filenames', () => {
  for (const route of ['/posts/100%notes', '/posts/literal%20name']) {
    const encodedRoute = route.split('/').map(encodeURIComponent).join('/')
    const input = `${siteUrl.slice(0, -1)}${encodedRoute}/index?source=rss#summary`
    const normalized = normalizeIndexUrl(input, { siteUrl, routes: new Set([route]) })
    const url = new URL(normalized)
    assert.equal(url.pathname, encodedRoute)
    assert.equal(decodeURIComponent(url.pathname), route)
    assert.equal(url.search, '?source=rss')
    assert.equal(url.hash, '#summary')
  }
})

test('JSON Feed links, displayed URLs and publication/update dates are corrected together', () => {
  const source = JSON.stringify({ items: [{ url: oldUrl, content_html: `<p><a href="${oldUrl}">${oldUrl}</a> <a href="https://other.example/index">External</a></p>`, date_published: '2026-09-03', date_modified: '2026-09-01' }] })
  const normalized = normalizeFeed(source, 'json', options)
  const item = JSON.parse(normalized).items[0]
  assert.equal(item.url, canonical)
  assert.equal(item.date_published, '2026-09-01T00:00:00.000Z')
  assert.equal(item.date_modified, '2026-09-03T00:00:00.000Z')
  assert.ok(item.content_html.includes(`href="${canonical}"`))
  assert.ok(item.content_html.includes(`>${canonical}</a>`))
  assert.ok(item.content_html.includes('https://other.example/index'))
  assert.equal(normalizeFeed(normalized, 'json', options), normalized)
})

test('Atom IDs, entry links, CDATA HTML and date semantics survive XML postprocessing', () => {
  const source = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>${oldUrl}</id><link href="${oldUrl}"/><updated>2026-09-01T00:00:00.000Z</updated><published>2026-09-03T00:00:00.000Z</published><content type="html"><![CDATA[<a href="${oldUrl}">Read more</a>]]></content></entry></feed>`
  const normalized = normalizeFeed(source, 'atom', options)
  const [entry] = feedEntries(normalized, 'atom')
  assert.equal(entry.url, canonical)
  assert.equal(entry.published, '2026-09-01T00:00:00.000Z')
  assert.equal(entry.modified, '2026-09-03T00:00:00.000Z')
  assert.ok(entry.html.includes(canonical))
  assert.ok(normalized.includes(`<id>${canonical}</id>`))
  assert.equal(normalizeFeed(normalized, 'atom', options), normalized)
})

test('RSS GUID and publication date are normalized without losing encoded HTML', () => {
  const source = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><link>${oldUrl}</link><guid>${oldUrl}</guid><pubDate>Thu, 03 Sep 2026 00:00:00 GMT</pubDate><content:encoded><![CDATA[<strong>Summary</strong><a href="${oldUrl}">Read</a>]]></content:encoded></item></channel></rss>`
  const normalized = normalizeFeed(source, 'rss', options)
  const [entry] = feedEntries(normalized, 'rss')
  assert.equal(entry.url, canonical)
  assert.equal(dateToIso(entry.published), '2026-09-01T00:00:00.000Z')
  assert.ok(entry.html.includes('<strong>Summary</strong>'))
  assert.ok(normalized.includes(`<guid>${canonical}</guid>`))
})

test('Long iframe openings cannot swallow feed summaries or the original article link', () => {
  const post = {
    data: { ...sourcePost.data, title: 'Safe summary' },
    content: `<iframe src="//player.bilibili.com/player.html?video=${'x'.repeat(300)}">Hidden embedded content</iframe>\n\n<script>hiddenScript()</script>\n\n<style>.hiddenStyle { color: red }</style>\n\n## 正文介绍\n\n这里是**需要保留的真实正文**。${'后续内容用于验证短摘要不会包含整篇文章。'.repeat(30)}`,
  }
  const settings = { ...options, postsByRoute: new Map([[route, post]]) }
  const brokenHtml = `<iframe src="https://blog.example//player.bilibi<br/><p>访问 <a href="${oldUrl}">${oldUrl}</a>`
  const fixtures = [
    ['json', JSON.stringify({ items: [{ id: 'stable-entry-id', url: oldUrl, content_html: brokenHtml, title: 'Original title' }] })],
    ['atom', `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>urn:entry:stable</id><link href="${oldUrl}"/><title>Original title</title><content type="html"><![CDATA[${brokenHtml}]]></content></entry></feed>`],
    ['rss', `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><guid>urn:entry:stable</guid><link>${oldUrl}</link><title>Original title</title><content:encoded><![CDATA[${brokenHtml}]]></content:encoded></item></channel></rss>`],
  ]
  for (const [format, source] of fixtures) {
    const normalized = normalizeFeed(source, format, settings)
    const [entry] = feedEntries(normalized, format)
    assert.equal(entry.url, canonical, format)
    assert.ok(entry.html.includes('需要保留的真实正文'), format)
    assert.ok(!/iframe|hiddenScript|hiddenStyle|player\.bilibili|Hidden embedded/.test(entry.html), format)
    assert.deepEqual(htmlDocument(entry.html, { fragment: true }).links.map(link => link.value), [canonical], format)
    assert.ok(normalized.includes('Original title'), format)
    assert.ok(normalized.includes(format === 'json' ? 'stable-entry-id' : 'urn:entry:stable'), format)
    assert.equal(normalizeFeed(normalized, format, settings), normalized, format)
  }
  assert.ok(Array.from(postSummaryText(post)).length <= 221)
})

test('Handwritten excerpts take priority and are escaped after extracting plain text', () => {
  const post = {
    data: { ...sourcePost.data, excerpt: '**手写摘要**：A & B < 3。<script>hiddenScript()</script>' },
    content: '这段正文不应替代手写摘要。',
  }
  const settings = { ...options, postsByRoute: new Map([[route, post]]) }
  const source = JSON.stringify({ items: [{ url: oldUrl, content_html: '<p>Old truncated content</p>' }] })
  const item = JSON.parse(normalizeFeed(source, 'json', settings)).items[0]
  assert.ok(item.content_html.includes('手写摘要'))
  assert.ok(item.content_html.includes('A &amp; B &lt; 3'))
  assert.ok(!/hiddenScript|这段正文|\*\*/.test(item.content_html))
  assert.deepEqual(htmlDocument(item.content_html, { fragment: true }).links.map(link => link.value), [canonical])
})

test('HTML language correction preserves other root attributes and rejects invalid language values', () => {
  assert.equal(setHtmlLanguage('<!doctype html><html lang="en" class="dark"><body/></html>', 'zh-CN'), '<!doctype html><html lang="zh-CN" class="dark"><body/></html>')
  assert.equal(setHtmlLanguage('<html data-ssg><body/></html>', 'en'), '<html data-ssg lang="en"><body/></html>')
  assert.throws(() => setHtmlLanguage('<html>', 'zh" onclick="alert(1)'))
})

test('Critters stylesheet clones reuse the anonymous CSS preload request without changing other markup', () => {
  const source = '<!doctype html><html><head><style>.x::before{content:"<link>"}</style><link rel="preload" crossorigin href="/assets/app-test.css" as="style"><link rel="modulepreload" crossorigin href="/assets/chunk.js"><link rel="preload" as="font" crossorigin href="/assets/font.woff2"><link rel="stylesheet" href="https://fonts.example/style.css"><link rel="preload" as="style" href="/assets/home-test.css"></head><body><link rel="stylesheet" href="/assets/app-test.css"><link rel="stylesheet" href="/assets/home-test.css"><script>const sample = \'<link rel="stylesheet" href="/assets/app-test.css">\'</script></body></html>'
  const expected = source.replace('<body><link rel="stylesheet" href="/assets/app-test.css">', '<body><link rel="stylesheet" href="/assets/app-test.css" crossorigin>')
  assert.equal(normalizeCssPreloadCredentials(source), expected)
  assert.equal(normalizeCssPreloadCredentials(expected), expected)
})

test('CSS preload matching preserves credentialed modes, query strings and explicit conflicting choices', () => {
  const source = '<link rel="preload" as="style" href="/assets/private.css?v=1&amp;x=2"/><link rel="stylesheet" href="/assets/private.css?v=1&amp;x=2" crossorigin="use-credentials"><link rel="preload" as="style" crossorigin href="/assets/conflict.css"><link rel="stylesheet" crossorigin="use-credentials" href="/assets/conflict.css"><link rel="preload" as="style" crossorigin href="https://cdn.example/other.css"><link rel="stylesheet" href="https://cdn.example/other.css">'
  const expected = source.replace('href="/assets/private.css?v=1&amp;x=2"/>', 'href="/assets/private.css?v=1&amp;x=2" crossorigin="use-credentials"/>')
  assert.equal(normalizeCssPreloadCredentials(source), expected)
})
