import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../paginationRoutes.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { createPaginationRoutes } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const article = (path, frontmatter = {}, children) => ({
  path,
  meta: { frontmatter: { date: '2026-10-24', ...frontmatter } },
  ...(children ? { children } : {}),
})
const pagination = paths => paths.filter(path => /^\/page\/\d+$/.test(path))

test('undated directory routes do not inflate pagination and static routes survive', () => {
  const routes = [
    ...Array.from({ length: 40 }, (_, i) => ({ path: `/posts/directory-${i}` })),
    ...Array.from({ length: 30 }, (_, i) => article(`/posts/article-${i}`)),
  ]
  const result = createPaginationRoutes([
    '/', '/about', '/404', '/posts/directory-1', '/page', '/page/',
    '/page/1', '/page/10/', '/page/:page', '/:all(.*)*', '/posts/:slug',
  ], routes, 7)
  assert.deepEqual(result, [
    '/', '/about', '/404', '/posts/directory-1',
    '/page/1', '/page/2', '/page/3', '/page/4', '/page/5',
  ])
})

test('relative and empty children merge with layout wrappers and normalized duplicates', () => {
  const routes = [{
    path: '/posts',
    children: [{
      path: '学习',
      children: [
        { path: '笔记', children: [article('')] },
        article('second/', {}, [{ path: '' }]),
        article('/posts/absolute'),
      ],
    }],
  },
  article('/posts/学习/笔记/'),
  article('/posts/%E5%AD%A6%E4%B9%A0/%E7%AC%94%E8%AE%B0'),
  article('/posts/学习/second'),
  ]
  assert.deepEqual(pagination(createPaginationRoutes(['/'], routes, 2)), ['/page/1', '/page/2'])
})

test('drafts, hidden articles, HTML routes, dynamic routes and non-post pages are excluded', () => {
  const routes = [
    article('/posts/visible'),
    article('/posts/draft', { draft: true }),
    article('/posts/hidden', { hide: true }),
    article('/posts/index-hidden', { hide: 'index' }),
    article('/posts/all-hidden', { hide: 'all' }),
    article('/posts/demo.html'),
    article('/posts/:slug'),
    article('/about'),
    article('/posts'),
    article('/posts/no-date', { date: undefined }),
    article('/posts/wrapped-hidden', {}, [{ path: '', meta: { frontmatter: { hide: true } } }]),
  ]
  assert.deepEqual(pagination(createPaginationRoutes(['/'], routes, 1)), ['/page/1'])
})

test('page counts follow exact boundaries, including zero articles', () => {
  for (const [count, pages] of [[0, 0], [1, 1], [7, 1], [8, 2], [14, 2], [15, 3]]) {
    const routes = Array.from({ length: count }, (_, i) => article(`/posts/${i}`))
    const result = createPaginationRoutes(['/', '/page/1', '/page/99'], routes, 7)
    assert.deepEqual(pagination(result), Array.from({ length: pages }, (_, i) => `/page/${i + 1}`))
  }
})

test('invalid page sizes fail explicitly', () => {
  for (const pageSize of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => createPaginationRoutes(['/'], [], pageSize), /positive safe integer/)
})
