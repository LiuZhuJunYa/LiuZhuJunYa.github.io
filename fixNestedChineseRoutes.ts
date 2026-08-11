import type { Plugin } from 'vite'

const shallowChineseRouteFix = `// fix chinese path
routes.forEach((i) => {
  i?.children?.forEach((j) => {
    j.path = encodeURI(j.path)
  })
})`

const recursiveChineseRouteFix = `// fix chinese path recursively in the browser
function encodeRoutePaths(routes) {
  routes.forEach((route) => {
    route.path = encodeURI(route.path)
    if (route.children)
      encodeRoutePaths(route.children)
  })
}

if (!import.meta.env.SSR)
  encodeRoutePaths(routes)
`

/**
 * Valaxy 0.19.5 only encodes the first nested route level. Browsers encode
 * every Chinese path segment on a full page load, so deeper blog URLs miss the
 * Vue Router matcher after a refresh. Keep SSG route names as Unicode so the
 * generated filesystem paths stay short and map to the URL after a static
 * server decodes it; the browser-side matcher must use the encoded pathname.
 */
export function fixNestedChineseRoutes(): Plugin {
  return {
    name: 'fix-valaxy-nested-chinese-routes',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id
        .replaceAll('\\', '/')
        .replace(/[?#].*$/, '')
      if (!normalizedId.endsWith('/valaxy/client/main.ts'))
        return

      if (!code.includes(shallowChineseRouteFix))
        throw new Error('Valaxy route encoding changed; review fixNestedChineseRoutes.ts.')

      const patchedCode = code.replace(shallowChineseRouteFix, recursiveChineseRouteFix)
      return {
        code: patchedCode,
        map: null,
      }
    },
  }
}
