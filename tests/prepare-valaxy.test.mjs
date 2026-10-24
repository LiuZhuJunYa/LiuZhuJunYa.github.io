import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import * as sass from 'sass'
import ts from 'typescript'
import { prepareValaxy } from '../scripts/prepare-valaxy.mjs'

const esmFile = 'valaxy/dist/chunk-LBOPLBJ5.mjs'
const cjsFile = 'valaxy/dist/chunk-G2FVTQKO.cjs'
const paletteFile = 'valaxy/client/styles/palette.scss'
const themeFile = 'valaxy-theme-yun/valaxy.config.ts'
const esmOriginal = 'langs:[...Object.keys(Sv),...t.languages||[]],langAlias:t.languageAlias'
const esmPrepared = 'langs:t.languages??Object.keys(Sv),langAlias:t.languageAlias'
const cjsOriginal = 'langs:[...Object.keys(_shiki.bundledLanguages),...t.languages||[]],langAlias:t.languageAlias'
const cjsPrepared = 'langs:t.languages??Object.keys(_shiki.bundledLanguages),langAlias:t.languageAlias'
const paletteOriginal = '"c-primary-rgb": #{color.red($c-primary), color.green($c-primary), color.blue($c-primary)},'
const palettePrepared = '"c-primary-rgb": #{color.channel($c-primary, "red", $space: rgb), color.channel($c-primary, "green", $space: rgb), color.channel($c-primary, "blue", $space: rgb)},'
const themeSource = [
  "import type { ResolvedValaxyOptions } from 'valaxy'",
  "import type { Plugin } from 'vite'",
  "import { defineTheme } from 'valaxy'",
  "import type { ThemeConfig } from './types'",
  "import { defaultThemeConfig, generateSafelist } from './index'",
  '',
  '// Keep unrelated plugin code unchanged.',
  'function ThemeVitePlugin(options: ResolvedValaxyOptions<ThemeConfig>): Plugin {',
  "  return { name: 'fixture-theme', marker: options.config.themeConfig.marker }",
  '}',
  '',
  'export default defineTheme<ThemeConfig>((options) => {',
  '  return {',
  '    themeConfig: defaultThemeConfig,',
  '    vite: {',
  '      plugins: [ThemeVitePlugin(options)],',
  '    },',
  '    unocss: {',
  '      safelist: generateSafelist(options),',
  '    },',
  '  }',
  '})',
  '',
].join('\n')

async function fixture(t) {
  const base = await realpath(tmpdir())
  const root = await mkdtemp(join(base, 'valaxy-prepare-test-'))
  t.after(async () => {
    const actual = await realpath(root)
    const inside = relative(base, actual)
    assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside) && basename(actual).startsWith('valaxy-prepare-test-'))
    await rm(actual, { recursive: true, force: true })
  })
  const sources = {
    'valaxy/package.json': JSON.stringify({ name: 'valaxy', version: '0.19.5' }),
    'valaxy-theme-yun/package.json': JSON.stringify({ name: 'valaxy-theme-yun', version: '0.19.5' }),
    [esmFile]: `// before\nfunction options(t){return {${esmOriginal}}}\n// after\noptions`,
    [cjsFile]: `// before\nmodule.exports=function(t){return {${cjsOriginal}}}\n// after`,
    [paletteFile]: `@use "sass:map";\n@use "sass:color";\n$c-primary: #0078e7;\n$light: (${paletteOriginal});\n:root { --c-primary-rgb: #{map.get($light, "c-primary-rgb")}; }\n`,
    [themeFile]: themeSource,
  }
  for (const [filename, source] of Object.entries(sources)) {
    const target = resolve(root, 'node_modules', filename)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, source, 'utf8')
  }
  return { root, sources, filename: name => resolve(root, 'node_modules', name) }
}

async function contents(f) {
  return Object.fromEntries(await Promise.all(Object.keys(f.sources).map(async name => [name, await readFile(f.filename(name), 'utf8')])))
}

test('Pinned packages are prepared once and unrelated source bytes stay intact', async (t) => {
  const f = await fixture(t)
  const first = await prepareValaxy(f.root)
  assert.equal(first.changed.length, 4)
  assert.equal(first.unchanged.length, 0)
  const prepared = await contents(f)
  assert.equal(prepared[esmFile], f.sources[esmFile].replace(esmOriginal, esmPrepared))
  assert.equal(prepared[cjsFile], f.sources[cjsFile].replace(cjsOriginal, cjsPrepared))
  assert.equal(prepared[paletteFile], f.sources[paletteFile].replace(paletteOriginal, palettePrepared))
  assert.ok(prepared[themeFile].includes('// Keep unrelated plugin code unchanged.'))
  assert.ok(prepared[themeFile].includes('marker: options.config.themeConfig.marker'))
  const second = await prepareValaxy(f.root)
  assert.equal(second.changed.length, 0)
  assert.equal(second.unchanged.length, 4)
  assert.deepEqual(await contents(f), prepared)
})

test('Both compiled formats honor explicit, empty and omitted language selections', async (t) => {
  const f = await fixture(t)
  await prepareValaxy(f.root)
  const registry = { python: {}, java: {} }
  const esm = vm.runInNewContext(await readFile(f.filename(esmFile), 'utf8'), { Sv: registry })
  const module = { exports: {} }
  vm.runInNewContext(await readFile(f.filename(cjsFile), 'utf8'), { _shiki: { bundledLanguages: registry }, module })
  for (const getOptions of [esm, module.exports]) {
    assert.deepEqual(Array.from(getOptions({}).langs), ['python', 'java'])
    assert.deepEqual(Array.from(getOptions({ languages: ['python'] }).langs), ['python'])
    assert.deepEqual(Array.from(getOptions({ languages: [] }).langs), [])
    const languages = [{ name: 'custom-language' }]
    const aliases = { py: 'python' }
    const options = getOptions({ languages, languageAlias: aliases })
    assert.equal(options.langs, languages)
    assert.equal(options.langAlias, aliases)
  }
})

test('Theme preparation removes runtime barrels while keeping the returned theme behavior', async (t) => {
  const f = await fixture(t)
  await prepareValaxy(f.root)
  const prepared = await readFile(f.filename(themeFile), 'utf8')
  const defaults = { title: 'default theme' }
  const generateSafelist = options => [options.config.themeConfig.marker]
  function load(source) {
    const requests = []
    const module = { exports: {} }
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    new Function('require', 'module', 'exports', output)((name) => {
      requests.push(name)
      if (name === 'valaxy')
        return { defineTheme: fn => fn }
      if (name === './index')
        return { defaultThemeConfig: defaults, generateSafelist }
      if (name === './node/config')
        return { defaultThemeConfig: defaults }
      if (name === './node/unocss')
        return { generateSafelist }
      throw new Error(`Unexpected runtime import: ${name}`)
    }, module, module.exports)
    return { fn: module.exports.default, requests }
  }
  const before = load(themeSource)
  const after = load(prepared)
  const options = { config: { themeConfig: { marker: 'kept' } } }
  assert.deepEqual(after.fn(options), before.fn(options))
  assert.deepEqual(before.requests, ['valaxy', './index'])
  assert.deepEqual(after.requests, ['./node/config', './node/unocss'])
})

test('Modern Sass channel calls produce identical CSS without color-function deprecations', async (t) => {
  const f = await fixture(t)
  await prepareValaxy(f.root)
  const before = f.sources[paletteFile]
  const after = await readFile(f.filename(paletteFile), 'utf8')
  for (const color of ['#0078e7', '#ab0193', 'rgb(10 20 30 / 0.5)']) {
    const beforeWarnings = []
    const afterWarnings = []
    const original = sass.compileString(before.replace('#0078e7', color), { logger: { warn: message => beforeWarnings.push(message) } })
    const prepared = sass.compileString(after.replace('#0078e7', color), { logger: { warn: message => afterWarnings.push(message) } })
    assert.equal(prepared.css, original.css)
    assert.equal(beforeWarnings.length, 3)
    assert.deepEqual(afterWarnings, [])
  }
})

for (const name of ['valaxy', 'valaxy-theme-yun']) {
  test(`An incompatible ${name} version fails before changing any installed source`, async (t) => {
    const f = await fixture(t)
    await writeFile(f.filename(`${name}/package.json`), JSON.stringify({ name, version: '0.20.0' }))
    const before = await contents(f)
    await assert.rejects(prepareValaxy(f.root), /expected .*@0\.19\.5.*found .*@0\.20\.0/)
    assert.deepEqual(await contents(f), before)
  })
}

test('Unknown or duplicated compiled fragments are rejected without partially preparing other files', async (t) => {
  const f = await fixture(t)
  await writeFile(f.filename(cjsFile), `${f.sources[cjsFile]}\n${cjsOriginal}`)
  const before = await contents(f)
  await assert.rejects(prepareValaxy(f.root), /Refusing to modify an unknown upstream implementation/)
  assert.deepEqual(await contents(f), before)
})

test('A partially changed theme header or changed closing block is rejected', async (t) => {
  const f = await fixture(t)
  await writeFile(f.filename(themeFile), themeSource.replace("import { defineTheme } from 'valaxy'\n", ''))
  const before = await contents(f)
  await assert.rejects(prepareValaxy(f.root), /exact imports, theme export and complete closing block/)
  assert.deepEqual(await contents(f), before)
})

test('Unexpected code after the theme closing block is rejected before other files change', async (t) => {
  const f = await fixture(t)
  await writeFile(f.filename(themeFile), `${themeSource}// unexpected upstream footer\n`)
  const before = await contents(f)
  await assert.rejects(prepareValaxy(f.root), /exact imports, theme export and complete closing block/)
  assert.deepEqual(await contents(f), before)
})

test('Reinstalled original chunks can be prepared alongside already-current dependency files', async (t) => {
  const f = await fixture(t)
  await prepareValaxy(f.root)
  await writeFile(f.filename(esmFile), f.sources[esmFile])
  await writeFile(f.filename(paletteFile), f.sources[paletteFile])
  const result = await prepareValaxy(f.root)
  assert.deepEqual(result.changed, [esmFile, paletteFile])
  assert.deepEqual(result.unchanged, [cjsFile, themeFile])
})

test('A missing pinned chunk fails with a reinstall instruction before any source is patched', async (t) => {
  const f = await fixture(t)
  await rm(f.filename(esmFile))
  await assert.rejects(prepareValaxy(f.root), /Run npm ci with development dependencies/)
  assert.equal(await readFile(f.filename(cjsFile), 'utf8'), f.sources[cjsFile])
  assert.equal(await readFile(f.filename(themeFile), 'utf8'), themeSource)
})
