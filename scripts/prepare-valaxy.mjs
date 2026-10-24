import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/*
 * Compatibility fixes for the exact Valaxy/Yun 0.19.5 packages in package-lock.json.
 * Run after npm ci and before dev/build. No generated bundle is committed or upgraded.
 * Every package version and every original/already-patched fragment is checked before
 * writing any file. Unknown implementations fail instead of accepting a fuzzy patch.
 *
 * To restore and reapply: npm ci (the project's postinstall reapplies these fixes).
 * To inspect pristine upstream sources: npm ci --ignore-scripts, before predev/build.
 * For an intentional rollback, remove this script's lifecycle calls before reinstalling.
 * Review all fixtures/guards when updating either upstream package; do not relax them.
 */

const packages = {
  valaxy: '0.19.5',
  'valaxy-theme-yun': '0.19.5',
}

const fragments = [
  {
    package: 'valaxy',
    file: 'dist/chunk-LBOPLBJ5.mjs',
    label: 'ESM syntax language selection',
    original: 'langs:[...Object.keys(Sv),...t.languages||[]],langAlias:t.languageAlias',
    patched: 'langs:t.languages??Object.keys(Sv),langAlias:t.languageAlias',
  },
  {
    package: 'valaxy',
    file: 'dist/chunk-G2FVTQKO.cjs',
    label: 'CJS syntax language selection',
    original: 'langs:[...Object.keys(_shiki.bundledLanguages),...t.languages||[]],langAlias:t.languageAlias',
    patched: 'langs:t.languages??Object.keys(_shiki.bundledLanguages),langAlias:t.languageAlias',
  },
  {
    package: 'valaxy',
    file: 'client/styles/palette.scss',
    label: 'Sass RGB channel API',
    original: '"c-primary-rgb": #{color.red($c-primary), color.green($c-primary), color.blue($c-primary)},',
    patched: '"c-primary-rgb": #{color.channel($c-primary, "red", $space: rgb), color.channel($c-primary, "green", $space: rgb), color.channel($c-primary, "blue", $space: rgb)},',
  },
]

const themeImports = {
  original: [
    "import type { ResolvedValaxyOptions } from 'valaxy'",
    "import type { Plugin } from 'vite'",
    "import { defineTheme } from 'valaxy'",
    "import type { ThemeConfig } from './types'",
    "import { defaultThemeConfig, generateSafelist } from './index'",
    '',
  ].join('\n'),
  patched: [
    "import type { ResolvedValaxyOptions } from 'valaxy'",
    "import type { Plugin } from 'vite'",
    "import type { ThemeConfig } from './types'",
    "import { defaultThemeConfig } from './node/config'",
    "import { generateSafelist } from './node/unocss'",
    '',
  ].join('\n'),
}
const themeExport = {
  original: 'export default defineTheme<ThemeConfig>((options) => {',
  patched: 'export default (options: ResolvedValaxyOptions<ThemeConfig>) => {',
}
const themeTail = {
  original: '    unocss: {\n      safelist: generateSafelist(options),\n    },\n  }\n})\n',
  patched: '    unocss: {\n      safelist: generateSafelist(options),\n    },\n  }\n}\n',
}

function count(source, fragment) {
  return source.split(fragment).length - 1
}

function incompatible(file, detail) {
  return new Error(`${file}: ${detail}. Refusing to modify an unknown upstream implementation. Restore the pinned dependencies with npm ci; review scripts/prepare-valaxy.mjs when changing dependency versions.`)
}

function patchFragment(source, patch) {
  const original = count(source, patch.original)
  const patched = count(source, patch.patched)
  if (original === 1 && patched === 0)
    return source.replace(patch.original, patch.patched)
  if (original === 0 && patched === 1)
    return source
  throw incompatible(`${patch.package}/${patch.file}`, `expected exactly one original or prepared ${patch.label} fragment, found ${original}/${patched}`)
}

function patchTheme(source) {
  const original = count(source, themeImports.original) === 1
    && count(source, themeImports.patched) === 0
    && count(source, themeExport.original) === 1
    && count(source, themeExport.patched) === 0
    && source.endsWith(themeTail.original)
    && count(source, 'defineTheme') === 2
  const patched = count(source, themeImports.original) === 0
    && count(source, themeImports.patched) === 1
    && count(source, themeExport.original) === 0
    && count(source, themeExport.patched) === 1
    && source.endsWith(themeTail.patched)
    && count(source, 'defineTheme') === 0
  if (patched)
    return source
  if (!original)
    throw incompatible('valaxy-theme-yun/valaxy.config.ts', 'the exact imports, theme export and complete closing block do not match')
  return source
    .replace(themeImports.original, themeImports.patched)
    .replace(themeExport.original, themeExport.patched)
    .slice(0, -themeTail.original.length) + themeTail.patched
}

async function installedFile(filename) {
  try {
    return await readFile(filename, 'utf8')
  }
  catch (error) {
    throw new Error(`Cannot read installed dependency file ${filename}. Run npm ci with development dependencies before preparing Valaxy.`, { cause: error })
  }
}

export async function prepareValaxy(projectRoot = process.cwd()) {
  const nodeModules = resolve(projectRoot, 'node_modules')
  // Complete all package/version/fragment checks before writing any dependency file.
  await Promise.all(Object.entries(packages).map(async ([name, version]) => {
    const filename = resolve(nodeModules, name, 'package.json')
    const pkg = JSON.parse(await installedFile(filename))
    if (pkg.name !== name || pkg.version !== version)
      throw incompatible(`${name}/package.json`, `expected ${name}@${version}, found ${pkg.name}@${pkg.version}`)
  }))

  const tasks = fragments.map(patch => ({
    filename: resolve(nodeModules, patch.package, patch.file),
    relative: `${patch.package}/${patch.file}`,
    transform: source => patchFragment(source, patch),
  }))
  tasks.push({
    filename: resolve(nodeModules, 'valaxy-theme-yun/valaxy.config.ts'),
    relative: 'valaxy-theme-yun/valaxy.config.ts',
    transform: patchTheme,
  })

  const plans = await Promise.all(tasks.map(async (task) => {
    const original = await installedFile(task.filename)
    return { ...task, original, prepared: task.transform(original) }
  }))
  const changed = []
  const unchanged = []
  for (const plan of plans) {
    if (plan.prepared === plan.original) {
      unchanged.push(plan.relative)
      continue
    }
    await writeFile(plan.filename, plan.prepared, 'utf8')
    changed.push(plan.relative)
  }
  return { changed, unchanged }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  prepareValaxy().then((result) => {
    console.log(`Valaxy 0.19.5 compatibility fixes ready (${result.changed.length} prepared, ${result.unchanged.length} already current).`)
  }).catch((error) => {
    console.error(`Valaxy preparation failed: ${error.message}`)
    process.exitCode = 1
  })
}
