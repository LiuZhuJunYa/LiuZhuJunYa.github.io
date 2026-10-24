import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../fixOptionalAddonImports.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { fixOptionalAddonImports } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const require = createRequire(import.meta.url)
const viteRequire = createRequire(require.resolve('vite'))
const { rollup } = viteRequire('rollup')
const emptyId = require.resolve('valaxy/client/addons/index.ts').replaceAll('\\', '/')
const emptySource = readFileSync(emptyId, 'utf8')
const fallback = { find: /^valaxy-addon-(.*)$/, replacement: emptyId }
const helpers = {
  'valaxy-addon-artalk': 'useArtalkWithOptions',
  'valaxy-addon-twikoo': 'useTwikooWithOptions',
  'valaxy-addon-waline': 'useAddonWaline',
  'valaxy-addon-algolia': 'useAddonAlgolia',
}

function configure(aliases = [fallback]) {
  const plugin = fixOptionalAddonImports()
  const result = plugin.config({ resolve: { alias: aliases } })
  return { plugin, result }
}

function js(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

test('only optional addons redirected to the Valaxy empty module are excluded', () => {
  const existingExclusions = ['@docsearch/js']
  const plugin = fixOptionalAddonImports()
  const config = { resolve: { alias: [fallback] }, optimizeDeps: { exclude: existingExclusions } }
  const result = plugin.config(config)
  assert.equal(plugin.enforce, 'post')
  assert.deepEqual(result.optimizeDeps.exclude, Object.keys(helpers))
  assert.deepEqual(config.optimizeDeps.exclude, ['@docsearch/js'])
  // This is the package/deep-import matching used by the installed Vite optimizer.
  for (const id of ['valaxy-addon-artalk/client/styles/index.scss', 'valaxy-addon-twikoo/client/styles/index.scss'])
    assert.ok(result.optimizeDeps.exclude.some(name => id === name || id.startsWith(`${name}/`)))
})

test('real addon aliases and unrelated packages remain untouched', () => {
  const enabledId = '/project/node_modules/valaxy-addon-artalk/client/index.ts'
  const { plugin, result } = configure([
    { find: 'valaxy-addon-artalk', replacement: enabledId },
    { find: 'valaxy-addon-components', replacement: '/project/node_modules/valaxy-addon-components/client/index.ts' },
    fallback,
  ])
  assert.deepEqual(result.optimizeDeps.exclude, ['valaxy-addon-twikoo', 'valaxy-addon-waline', 'valaxy-addon-algolia'])
  assert.equal(plugin.transform('export function useArtalkWithOptions() {}', enabledId), undefined)
  assert.equal(plugin.transform('export const value = 1', '/project/components/YunComment.vue'), undefined)
  const transformed = plugin.transform(emptySource, emptyId).code
  assert.ok(!transformed.includes('export function useArtalkWithOptions'))
})

test('without the framework fallback no dependencies or modules are changed', () => {
  const { plugin, result } = configure({ 'valaxy-addon-waline': '/project/waline.ts' })
  assert.equal(result, undefined)
  assert.equal(plugin.transform(emptySource, emptyId), undefined)
})

test('framework empty-addon sentinels survive and every accidental helper call fails clearly', async () => {
  const { plugin } = configure()
  const transformed = plugin.transform(emptySource, `${emptyId}?v=123`).code
  assert.ok(transformed.startsWith(emptySource))
  const addon = await import(`data:text/javascript;base64,${Buffer.from(js(transformed)).toString('base64')}`)
  assert.equal(addon.name, 'virtual:valaxy-addons:empty')
  assert.equal(addon.emptyAddonName, addon.name)
  assert.equal(addon.default.name, addon.name)
  assert.equal(addon.isEmptyAddon(addon), true)
  assert.equal(addon.isEmptyAddon({ name: 'real-addon' }), false)
  for (const [name, helper] of Object.entries(helpers))
    assert.throws(() => addon[helper](), error => error.message.includes(name) && error.message.includes('Install and register'))
  assert.deepEqual(Object.keys(addon).sort(), ['default', 'emptyAddonName', 'isEmptyAddon', 'name', ...Object.values(helpers)].sort())
})

test('Windows IDs work and stateful alias expressions are not mutated', () => {
  // Use a Windows fixture on every host: emptyId is a POSIX path on Linux CI.
  const physicalId = 'C:/project/node_modules/valaxy/client/addons/index.ts'
  const expression = /^valaxy-addon-(.*)$/g
  expression.lastIndex = 4
  const { plugin, result } = configure([{ find: expression, replacement: `/@fs/${physicalId}`.replaceAll('/', '\\') }])
  assert.equal(expression.lastIndex, 4)
  assert.equal(result.optimizeDeps.exclude.length, 4)
  assert.ok(plugin.transform(emptySource, physicalId))
  assert.ok(plugin.transform(emptySource, physicalId.replaceAll('/', '\\')))
  assert.ok(plugin.transform(emptySource, `/@fs/${physicalId}?v=123`))
})

test('Valaxy filesystem URL aliases also match POSIX transform IDs', () => {
  const physicalId = '/project/node_modules/valaxy/client/addons/index.ts'
  const { plugin, result } = configure([{ find: /^valaxy-addon-(.*)$/, replacement: `/@fs${physicalId}` }])
  assert.equal(result.optimizeDeps.exclude.length, 4)
  assert.ok(plugin.transform(emptySource, physicalId))
  assert.ok(plugin.transform(emptySource, `/@fs${physicalId}?v=123`))
})

test('unexpected changes to the framework placeholder fail explicitly', () => {
  const { plugin } = configure()
  assert.throws(() => plugin.transform('export default {}', emptyId), /implementation changed/)
})

test('Rollup stops reporting the theme adapter missing exports, including Algolia', async () => {
  const entry = Object.entries(helpers).map(([addon, helper], index) =>
    `import * as addon${index} from '${addon}'; export const adapter${index} = () => addon${index}.${helper}();`,
  ).join('\n')
  const { plugin } = configure()
  async function bundleWarnings(code) {
    const warnings = []
    const bundle = await rollup({
      input: 'entry',
      plugins: [{
        name: 'optional-addon-test-fixture',
        resolveId(id) { return id === 'entry' ? id : id in helpers ? emptyId : null },
        load(id) { return id === 'entry' ? entry : id === emptyId ? js(code) : null },
      }],
      onwarn: warning => warnings.push(warning),
    })
    try { await bundle.generate({ format: 'es' }) }
    finally { await bundle.close() }
    return warnings
  }
  const original = await bundleWarnings(emptySource)
  assert.equal(original.filter(warning => warning.code === 'MISSING_EXPORT').length, 4)
  assert.deepEqual(await bundleWarnings(plugin.transform(emptySource, emptyId).code), [])
})

test('real Valaxy aliases pass through Vite client and SSR transforms with helper exports', async (context) => {
  const { resolveOptions, ViteValaxyPlugins, toAtFS } = await import('valaxy/node')
  const { createServer } = await import('vite')
  const { createHooks } = await import('hookable')
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const options = await resolveOptions({ userRoot: projectRoot }, 'dev')
  // A transform test should not rewrite the project's generated declarations.
  options.config.router = { ...options.config.router, dts: false }
  options.config.components = { ...options.config.components, dts: false }
  const hooks = createHooks()
  const app = { options, hooks, hook: hooks.hook.bind(hooks), version: '0.19.5' }
  const plugins = await ViteValaxyPlugins(app)
  const server = await createServer({
    ...options.config.vite,
    configFile: false,
    plugins: [...options.config.vite.plugins, ...plugins],
    logLevel: 'silent',
    server: { ...options.config.vite.server, middlewareMode: true, hmr: false, watch: null },
  })
  try {
    const missing = []
    for (const [addon, helper] of Object.entries(helpers)) {
      const resolution = await server.pluginContainer.resolveId(addon, resolve(options.themeRoot, 'components/third/YunArtalk.vue'))
      if (resolution?.id.replaceAll('\\', '/').replace(/[?#].*$/, '').endsWith('/valaxy/client/addons/index.ts'))
        missing.push({ addon, helper, resolution })
    }
    if (!missing.length) {
      context.skip('All optional addons in the real project configuration are enabled.')
      return
    }
    for (const { addon } of missing)
      assert.ok(server.config.optimizeDeps.exclude.includes(addon), addon)
    for (const ssr of [false, true]) {
      const transformed = await server.transformRequest(toAtFS(missing[0].resolution.id), { ssr })
      assert.ok(transformed, `Expected ${ssr ? 'SSR' : 'client'} transform`)
      for (const { helper } of missing)
        assert.ok(transformed.code.includes(`function ${helper}(`), `${ssr ? 'SSR' : 'client'}: ${helper}`)
      assert.ok(transformed.code.includes('virtual:valaxy-addons:empty'))
      assert.ok(transformed.code.includes('isEmptyAddon'))
    }
  }
  finally {
    await server.close()
  }
})
