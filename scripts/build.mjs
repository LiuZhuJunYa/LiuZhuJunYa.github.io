import { spawn } from 'node:child_process'
import { lstat, readFile, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from './build-utils.mjs'
import { postprocessBuild } from './postprocess-build.mjs'
import { prepareValaxy } from './prepare-valaxy.mjs'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

async function prepareDist(root) {
  const canonicalRoot = await realpath(resolve(root))
  const dist = resolve(canonicalRoot, 'dist')
  // Only this project's immediate dist child may be recursively removed.
  if (!isAbsolute(dist) || dirname(dist) !== canonicalRoot || basename(dist) !== 'dist' || dist === canonicalRoot)
    throw new Error(`Refusing to clean an output path outside the project: ${dist}`)

  const existing = await lstat(dist).catch((error) => {
    if (error.code === 'ENOENT')
      return null
    throw error
  })
  if (existing?.isSymbolicLink())
    throw new Error(`Refusing to clean a symbolic link or junction: ${dist}`)

  await rm(dist, { recursive: true, force: true })
  return { root: canonicalRoot, dist }
}

export async function runValaxyBuild({ root }) {
  await prepareValaxy(root)
  const cli = require.resolve('valaxy/bin/valaxy.mjs')
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [cli, 'build', '--ssg'], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (signal)
        reject(new Error(`Valaxy build was terminated by ${signal}`))
      else
        resolveExit(code ?? 1)
    })
  })
}

// The injectable callbacks let regression tests exercise false-success CLI exits.
export async function buildSite({ root = projectRoot, runCli = runValaxyBuild, postprocess = postprocessBuild } = {}) {
  const output = await prepareDist(root)
  const exitCode = await runCli(output)
  if (exitCode !== 0)
    throw new Error(`Valaxy build failed with exit code ${exitCode}`)

  let html
  try {
    html = await readFile(resolve(output.dist, 'index.html'), 'utf8')
  }
  catch (error) {
    throw new Error('Valaxy returned success without producing a fresh dist/index.html', { cause: error })
  }
  if (!html.includes('__INITIAL_STATE__') || !/<div\b[^>]*\bid=["']app["']/i.test(html) || !/<\/html\s*>/i.test(html))
    throw new Error('Valaxy returned success but dist/index.html is incomplete or is not a rendered SSG page')

  return postprocess(output.root)
}

if (isMainModule(import.meta.url)) {
  buildSite().then((result) => {
    console.log(`Build succeeded. Normalized HTML language in ${result.pages} pages and article links/dates in ${result.feeds} feeds.`)
  }).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
