import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import test from 'node:test'
import MarkdownIt from 'markdown-it'
import { createHighlighter } from 'shiki'
import * as grammarMetadata from 'shiki/langs'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../highlightLanguages.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source.replaceAll('import.meta.url', JSON.stringify(new URL('../highlightLanguages.ts', import.meta.url).href)), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
})
const loaded = { exports: {} }
new Function('require', 'module', 'exports', outputText)((id) => {
  if (id === 'markdown-it')
    return MarkdownIt
  if (id === 'shiki/langs')
    return grammarMetadata
  return require(id)
}, loaded, loaded.exports)
const { collectFenceLanguages, createHighlightLanguages, normalizeFenceLanguage } = loaded.exports

async function fixture(t, content = '') {
  const parent = resolve(tmpdir())
  const root = await mkdtemp(resolve(parent, 'blog-highlight-test-'))
  t.after(async () => {
    assert.equal(dirname(root), parent)
    assert.ok(basename(root).startsWith('blog-highlight-test-'))
    await rm(root, { recursive: true, force: true })
  })
  await mkdir(resolve(root, 'pages/nested'), { recursive: true })
  await writeFile(resolve(root, 'pages/nested/article.md'), content)
  return root
}

function hotContext(file, content, warnings = []) {
  return { file, read: async () => content, server: { config: { logger: { warn: message => warnings.push(message) } } } }
}

test('fence parsing follows Markdown nesting and Valaxy metadata syntax', () => {
  const markdown = [
    '---', 'description: |', '  ```rust', '  not a fence', '  ```', '---', '',
    '~~~JS-vue:line-numbers=3 [client] {1,3}', 'const x = 1', '~~~', '',
    '- list:', '', '  ```py=7', '  print(1)', '  ```', '',
    '> ~~~sh', '> echo ok', '> ~~~', '',
    '   ```java', 'class Test {}', '   ```', '',
    '    ```go', '    not a Markdown fence', '    ```', '',
    '````markdown', '```ruby', 'only an example inside the outer fence', '```', '````', '',
    '```vue-html', '<div />', '```', '',
    '```mermaid', 'graph LR; A --> B', '```', '',
    '```plaintext', 'plain', '```', '',
    '```does-not-exist', 'fallback', '```',
  ].join('\n')
  assert.deepEqual(collectFenceLanguages(markdown), ['java', 'javascript', 'markdown', 'python', 'shellscript', 'vue-html'])
  assert.equal(normalizeFenceLanguage('ts-vue:no-line-numbers=42 [tab] {1-3}'), 'ts')
  assert.equal(normalizeFenceLanguage('c++:line-numbers'), 'c++')
})

test('built-in and custom aliases deduplicate, while plain text and unknown grammars stay unloaded', () => {
  const markdown = ['```js', 'x', '```', '```javascript', 'x', '```', '```custom', 'x', '```', '```cycle', 'x', '```', '```txt', 'x', '```'].join('\n')
  assert.deepEqual(collectFenceLanguages(markdown, { custom: 'js', cycle: 'loop', loop: 'cycle' }), ['javascript'])
  assert.deepEqual(collectFenceLanguages('```ansi\nx\n```\n```unknown\nx\n```'), [])
})

test('startup scans only Markdown pages and preserves explicit custom LanguageInput', async (t) => {
  const root = await fixture(t, '```java\nclass Test {}\n```')
  await writeFile(resolve(root, 'pages/ignored.txt'), '```go\npackage main\n```')
  await writeFile(resolve(root, 'outside.md'), '```ruby\nx\n```')
  const grammar = { name: 'custom-test', scopeName: 'source.custom-test', patterns: [] }
  const controller = createHighlightLanguages({ root, defaultHighlightLang: 'ts', languages: [grammar] })
  assert.deepEqual(controller.languageNames, ['java', 'typescript'])
  assert.equal(controller.languages.at(-1), grammar)
  assert.equal(controller.languages.length, 3)
  const emptyRoot = await fixture(t, '```text\nplain\n```')
  assert.deepEqual(createHighlightLanguages({ root: emptyRoot }).languages, [])
})

test('actual Shiki loads newly introduced languages before HMR and first-file transforms', async (t) => {
  const root = await fixture(t, '```ts\nconst original = 1\n```')
  const controller = createHighlightLanguages({ root })
  const highlighter = await createHighlighter({ themes: ['github-light'], langs: controller.languages })
  t.after(() => highlighter.dispose())
  await controller.shikiSetup(highlighter)
  assert.equal(highlighter.getLoadedLanguages().includes('rust'), false)
  const warnings = []
  const outcome = await controller.plugin.handleHotUpdate(hotContext(resolve(root, 'pages/nested/article.md'), '```rust\nfn main() {}\n```', warnings))
  assert.equal(outcome, undefined, 'normal Vite HMR must continue')
  assert.equal(highlighter.getLoadedLanguages().includes('rust'), true)
  assert.match(highlighter.codeToHtml('fn main() {}', { lang: 'rust', theme: 'github-light' }), /<span style=/)

  const transform = controller.plugin.transform.handler
  const transformed = await transform.call({ warn: message => warnings.push(message) }, '```sql\nSELECT 1;\n```', resolve(root, 'pages/new-article.md'))
  assert.equal(transformed, null)
  assert.equal(highlighter.getLoadedLanguages().includes('sql'), true)
  assert.match(highlighter.codeToHtml('SELECT 1;', { lang: 'sql', theme: 'github-light' }), /<span style=/)
  assert.deepEqual(warnings, [])

  let loads = 0
  const originalLoad = highlighter.loadLanguage
  highlighter.loadLanguage = async (...inputs) => { loads++; await originalLoad(...inputs) }
  const python = hotContext(resolve(root, 'pages/nested/article.md'), '```py\nprint(1)\n```')
  await Promise.all([controller.plugin.handleHotUpdate(python), controller.plugin.handleHotUpdate(python)])
  assert.equal(loads, 1, 'concurrent changes must share one grammar load')
  await controller.plugin.handleHotUpdate(hotContext(resolve(root, 'pages/nested/article.md'), 'Only ordinary text.'))
  await controller.plugin.handleHotUpdate(hotContext(resolve(root, 'pages/nested/article.md'), '```unknown-grammar\nx\n```', warnings))
  assert.equal(loads, 1)
  assert.deepEqual(warnings, [], 'unknown labels remain for the existing framework fallback warning')
  assert.equal(highlighter.getLoadedLanguages().includes('rust'), true, 'removing a fence need not unload its cached grammar')
})

test('changes before Shiki setup are queued and deleted-file races do not stop HMR', async (t) => {
  const root = await fixture(t)
  let originalSetup = false
  const controller = createHighlightLanguages({ root, shikiSetup: () => { originalSetup = true } })
  await controller.plugin.transform.handler.call({ warn() {} }, '```lua\nlocal x = 1\n```', resolve(root, 'pages/new.md'))
  const highlighter = await createHighlighter({ themes: [], langs: controller.languages })
  t.after(() => highlighter.dispose())
  await controller.shikiSetup(highlighter)
  assert.equal(originalSetup, true)
  assert.equal(highlighter.getLoadedLanguages().includes('lua'), true)
  const deleted = hotContext(resolve(root, 'pages/deleted.md'), '')
  deleted.read = async () => { throw Object.assign(new Error('deleted'), { code: 'ENOENT' }) }
  assert.equal(await controller.plugin.handleHotUpdate(deleted), undefined)
  deleted.read = async () => { throw Object.assign(new Error('access denied'), { code: 'EACCES' }) }
  await assert.rejects(controller.plugin.handleHotUpdate(deleted), /access denied/)
})
