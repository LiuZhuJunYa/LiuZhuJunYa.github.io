import type { RouteRecordRaw } from 'vue-router'

type ArticleFrontmatter = {
  date?: unknown
  draft?: unknown
  hide?: unknown
}

function normalizePath(path: string, parent = '/') {
  const joined = path.startsWith('/') ? path : `${parent}/${path}`
  const normalized = joined.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  try {
    return decodeURI(normalized)
  }
  catch {
    return normalized
  }
}

/** Build SSG pagination from the same published articles shown on the home page. */
export function createPaginationRoutes(paths: string[], routes: Readonly<RouteRecordRaw[]>, pageSize: number): string[] {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0)
    throw new Error('pageSize must be a positive safe integer')

  const articles = new Map<string, ArticleFrontmatter>()
  function visit(records: Readonly<RouteRecordRaw[]>, parent = '/') {
    for (const route of records) {
      const path = normalizePath(route.path, parent)
      const frontmatter = route.meta?.frontmatter as ArticleFrontmatter | undefined
      if (frontmatter && typeof frontmatter === 'object') {
        // Layout wrappers and empty child routes can describe the same article.
        articles.set(path, { ...articles.get(path), ...frontmatter })
      }
      if (route.children)
        visit(route.children, path)
    }
  }
  visit(routes)

  const postCount = [...articles].filter(([path, data]) =>
    path.startsWith('/posts/')
    && !path.includes(':')
    && !path.endsWith('.html')
    && data.date
    && !data.draft
    && !data.hide,
  ).length

  const result = new Map<string, string>()
  for (const path of paths) {
    const normalized = normalizePath(path)
    if (!normalized.includes(':') && !/^\/page(?:\/\d+)?$/.test(normalized) && !result.has(normalized))
      result.set(normalized, path)
  }
  for (let page = 1; page <= Math.ceil(postCount / pageSize); page++) {
    const path = `/page/${page}`
    result.set(path, path)
  }
  return [...result.values()]
}
