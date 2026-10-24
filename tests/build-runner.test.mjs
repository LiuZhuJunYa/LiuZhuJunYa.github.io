import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import test from 'node:test'
import { buildSite } from '../scripts/build.mjs'

const renderedPage = '<html><body><div id="app"><main>Fresh page</main></div><script>window.__INITIAL_STATE__={}</script></body></html>'

async function fixture(t) {
  const parent = resolve(tmpdir())
  const root = await mkdtemp(resolve(parent, 'blog-build-runner-'))
  t.after(async () => {
    assert.equal(dirname(root), parent)
    assert.ok(basename(root).startsWith('blog-build-runner-'))
    await rm(root, { recursive: true, force: true })
  })
  await mkdir(resolve(root, 'dist'))
  await writeFile(resolve(root, 'dist/index.html'), renderedPage.replace('Fresh', 'Stale'))
  await writeFile(resolve(root, 'keep.txt'), 'Keep project files')
  return root
}

test('a false-success CLI cannot reuse old dist output or run postprocessing', async (t) => {
  const root = await fixture(t)
  let postprocessed = false
  await assert.rejects(buildSite({
    root,
    async runCli(output) {
      assert.equal(output.root, root)
      assert.equal(output.dist, resolve(root, 'dist'))
      assert.equal(existsSync(output.dist), false, 'old output must be removed before invoking the CLI')
      return 0
    },
    async postprocess() { postprocessed = true },
  }), /without producing a fresh dist\/index\.html/)
  assert.equal(postprocessed, false)
  assert.equal(await readFile(resolve(root, 'keep.txt'), 'utf8'), 'Keep project files')
})

test('a nonzero CLI exit fails even when new SSG output exists', async (t) => {
  const root = await fixture(t)
  await assert.rejects(buildSite({
    root,
    async runCli({ dist }) {
      await mkdir(dist)
      await writeFile(resolve(dist, 'index.html'), renderedPage)
      return 2
    },
    async postprocess() { assert.fail('postprocessing must not run after CLI failure') },
  }), /exit code 2/)
})

test('a successful CLI with an SPA shell fails SSG validation', async (t) => {
  const root = await fixture(t)
  await assert.rejects(buildSite({
    root,
    async runCli({ dist }) {
      await mkdir(dist)
      await writeFile(resolve(dist, 'index.html'), '<html><body><div id="app"></div></body></html>')
      return 0
    },
    async postprocess() { assert.fail('postprocessing must not run for an unrendered page') },
  }), /not a rendered SSG page/)
})

test('fresh SSG output is postprocessed only after validation', async (t) => {
  const root = await fixture(t)
  const expected = { pages: 1, feeds: 0 }
  const result = await buildSite({
    root,
    async runCli({ dist }) {
      await mkdir(dist)
      await writeFile(resolve(dist, 'index.html'), renderedPage)
      return 0
    },
    async postprocess(actualRoot) {
      assert.equal(actualRoot, root)
      assert.equal(await readFile(resolve(root, 'dist/index.html'), 'utf8'), renderedPage)
      return expected
    },
  })
  assert.equal(result, expected)
})
