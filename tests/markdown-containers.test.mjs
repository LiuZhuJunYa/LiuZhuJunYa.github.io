import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import MarkdownIt from 'markdown-it'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/extendMarkdown.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
const loaded = { exports: {} }
new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports)
const md = new MarkdownIt()
loaded.exports.default(md)
const names = ['definition', 'theorem', 'algorithm', 'conclusion']

test('all custom containers preserve Markdown content and escape titles', () => {
  for (const name of names) {
    const html = md.render(`::: ${name} <img src=x onerror=alert(1)>\n\n**Important**\n\n1. First\n2. Second\n\n:::\n`)
    assert.ok(html.startsWith(`<div class="${name}">`))
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
    assert.ok(!html.includes('<img'))
    assert.ok(html.includes('<strong>Important</strong>'))
    assert.ok(html.includes('<ol>'))
    assert.ok(html.endsWith('</div>\n'))
  }
})

test('untitled custom containers remain ordinary text as documented', () => {
  for (const name of names)
    assert.ok(!md.render(`::: ${name}\nContent\n:::\n`).includes(`<div class="${name}">`))
})

test('nested containers close independently and preserve the surrounding body', () => {
  const html = md.render(':::: definition Outer\n\nBefore\n\n::: conclusion Inner\n\n**Answer**\n\n:::\n\nAfter\n\n::::\n')
  assert.equal((html.match(/<div class=/g) || []).length, 2)
  assert.equal((html.match(/<\/div>/g) || []).length, 2)
  assert.match(html, /<strong>Answer<\/strong>[\s\S]*<\/div>[\s\S]*<p>After<\/p>[\s\S]*<\/div>/)
})
