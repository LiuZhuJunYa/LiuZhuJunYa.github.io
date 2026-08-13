import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const root = resolve('dist')
const pagesRoot = resolve('pages')
const requiredFiles = [
  'index.html',
  '404.html',
  'CNAME',
  'posts/web安全/千锋网络安全/01Windows网络与服务器基础学习笔记.html',
]
const expectedCname = 'liuzhujunya.top'

async function collectHtmlFiles(directory) {
  const files = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filepath = join(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await collectHtmlFiles(filepath))
    else if (entry.isFile() && entry.name.endsWith('.html'))
      files.push(filepath)
  }

  return files
}

async function countMarkdownFiles(directory) {
  let count = 0

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filepath = join(directory, entry.name)
    if (entry.isDirectory())
      count += await countMarkdownFiles(filepath)
    else if (entry.isFile() && entry.name.endsWith('.md'))
      count += 1
  }

  return count
}

const failures = []

for (const filepath of requiredFiles) {
  const absolutePath = join(root, filepath)
  try {
    const file = await stat(absolutePath)
    if (!file.isFile() || file.size === 0)
      failures.push(`${filepath} is empty`)
  }
  catch {
    failures.push(`${filepath} is missing`)
  }
}

const htmlFiles = await collectHtmlFiles(root)
const markdownFiles = await countMarkdownFiles(pagesRoot)
if (htmlFiles.length < markdownFiles)
  failures.push(`only ${htmlFiles.length} HTML files were generated for ${markdownFiles} Markdown pages`)

const indexPath = join(root, 'index.html')
try {
  const index = await readFile(indexPath, 'utf8')
  if (Buffer.byteLength(index) < 10_000)
    failures.push('index.html is still the unrendered Vite shell')
  if (!index.includes('__INITIAL_STATE__'))
    failures.push('index.html has no SSG state')
  if (!index.includes('</html>'))
    failures.push('index.html is incomplete')
}
catch {
  // The missing-file failure above is more specific.
}

try {
  const notFound = await readFile(join(root, '404.html'), 'utf8')
  if (!notFound.includes('/assets/'))
    failures.push('404.html cannot bootstrap the blog application')
}
catch {
  // The missing-file failure above is more specific.
}

try {
  const cname = (await readFile(join(root, 'CNAME'), 'utf8')).trim()
  if (cname !== expectedCname)
    failures.push(`CNAME contains "${cname}" instead of "${expectedCname}"`)
}
catch {
  // The missing-file failure above is more specific.
}

try {
  const assets = await readdir(join(root, 'assets'))
  if (!assets.some(asset => asset.endsWith('.js')))
    failures.push('no JavaScript assets were generated')
  if (!assets.some(asset => asset.endsWith('.css')))
    failures.push('no CSS assets were generated')
}
catch {
  failures.push('assets directory is missing')
}

if (failures.length) {
  console.error('GitHub Pages artifact is incomplete:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified ${htmlFiles.length} rendered HTML files in ${relative(process.cwd(), root)}.`)
