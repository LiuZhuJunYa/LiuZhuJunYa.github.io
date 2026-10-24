import type { Plugin } from 'vite'

// These are the only optional-addon helpers referenced by Yun 0.19.5.
const optionalAddonHelpers = {
  'valaxy-addon-artalk': 'useArtalkWithOptions',
  'valaxy-addon-twikoo': 'useTwikooWithOptions',
  'valaxy-addon-waline': 'useAddonWaline',
  'valaxy-addon-algolia': 'useAddonAlgolia',
} as const

const emptyAddonName = 'virtual:valaxy-addons:empty'

function normalizeId(id: string) {
  let normalized = id.replaceAll('\\', '/').replace(/[?#].*$/, '')
  // Valaxy stores aliases as /@fs/E:/... URLs, while Vite's transform hook
  // receives E:/... filesystem IDs. On POSIX the filesystem leading / remains.
  if (normalized.startsWith('/@fs/'))
    normalized = normalized.slice('/@fs'.length)
  return normalized.replace(/^\/([a-zA-Z]:\/)/, '$1')
}

function matchesAlias(find: string | RegExp, id: string) {
  if (typeof find === 'string')
    return id === find || id.startsWith(`${find}/`)
  // Do not change lastIndex on any regular expression supplied by another plugin.
  return new RegExp(find.source, find.flags.replace(/[gy]/g, '')).test(id)
}

/**
 * Yun imports adapters for optional addons even when they are not enabled.
 * Valaxy redirects those imports (including style subpaths) to its empty addon.
 * Keep these placeholders out of dependency optimization, and declare precisely
 * the adapter helpers so Rollup does not report missing namespace exports.
 */
export function fixOptionalAddonImports(): Plugin {
  let missing: Array<{ addon: string, helper: string }> = []
  const emptyModuleIds = new Set<string>()

  return {
    name: 'blog:optional-addon-placeholders',
    // Valaxy's pre-config hook must establish the real addon aliases first.
    enforce: 'post',
    config(config) {
      missing = []
      emptyModuleIds.clear()
      const configuredAliases = config.resolve?.alias || []
      const aliases = Array.isArray(configuredAliases)
        ? configuredAliases
        : Object.entries(configuredAliases).map(([find, replacement]) => ({ find, replacement }))

      for (const [addon, helper] of Object.entries(optionalAddonHelpers)) {
        const alias = aliases.find(entry => matchesAlias(entry.find, addon))
        if (!alias)
          continue
        const replacement = normalizeId(alias.replacement)
        if (!replacement.endsWith('/valaxy/client/addons/index.ts'))
          continue
        missing.push({ addon, helper })
        emptyModuleIds.add(replacement)
      }

      if (missing.length) {
        return {
          optimizeDeps: {
            // Vite also excludes each package's deep imports, including SCSS.
            exclude: missing.map(({ addon }) => addon),
          },
        }
      }
    },
    transform(code, id) {
      if (!missing.length || !emptyModuleIds.has(normalizeId(id)))
        return
      if (!code.includes(emptyAddonName) || !/\bisEmptyAddon\b/.test(code))
        throw new Error('Valaxy empty-addon implementation changed; review fixOptionalAddonImports.ts.')

      const helpers = missing.map(({ addon, helper }) => {
        const message = `Optional addon ${addon} is not enabled. Install and register it before calling ${helper}().`
        return `export function ${helper}() { throw new Error(${JSON.stringify(message)}); }`
      }).join('\n')
      return { code: `${code}\n${helpers}\n`, map: null }
    },
  }
}
