import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as Vue from 'vue'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/YunAside.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source, { filename: 'YunAside.vue' })
const { outputText } = ts.transpileModule(compileScript(descriptor, { id: 'toc-test' }).content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})

function setup(t, { mount = true } = {}) {
  const previous = { window: globalThis.window, document: globalThis.document }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined)
        delete globalThis[key]
      else
        globalThis[key] = value
    }
  })
  const mounted = []
  const unmounted = []
  const documentListeners = new Map()
  const mediaListeners = new Map()
  const media = {
    matches: false,
    addEventListener: (type, listener) => mediaListeners.set(type, listener),
    removeEventListener: (type, listener) => { assert.equal(mediaListeners.get(type), listener); mediaListeners.delete(type) },
  }
  let headingFocused = 0
  let buttonFocused = 0
  let linkFocused = 0
  const heading = {
    hasAttribute: () => false,
    focus: () => { headingFocused++ },
  }
  globalThis.window = { matchMedia: query => { assert.equal(query, '(min-width: 1280px)'); return media } }
  globalThis.document = {
    addEventListener: (type, listener) => documentListeners.set(type, listener),
    removeEventListener: (type, listener) => { assert.equal(documentListeners.get(type), listener); documentListeners.delete(type) },
    getElementById: id => { assert.equal(id, '学习章节'); return heading },
  }
  const app = Vue.reactive({
    isRightSidebarOpen: false,
    toggleRightSidebar(value) { this.isRightSidebarOpen = value ?? !this.isRightSidebarOpen },
  })
  const componentModule = { exports: {} }
  const componentRequire = (id) => {
    if (id === 'vue')
      return { ...Vue, onMounted: hook => mounted.push(hook), onUnmounted: hook => unmounted.push(hook) }
    if (id === 'vue-i18n')
      return { useI18n: () => ({ t: key => key }) }
    if (id === 'valaxy')
      return { useAppStore: () => app, useFrontmatter: () => Vue.ref({ toc: true }) }
    return require(id)
  }
  new Function('require', 'module', 'exports', outputText)(componentRequire, componentModule, componentModule.exports)
  const state = componentModule.exports.default.setup({}, { expose() {} })
  state.toggleButton.value = { focus: () => { buttonFocused++ } }
  state.aside.value = { querySelector: () => ({ focus: () => { linkFocused++ } }) }
  if (mount)
    mounted.forEach(hook => hook())
  return {
    state, app, media, mediaListeners, documentListeners, heading,
    unmount: () => unmounted.forEach(hook => hook()),
    focused: () => ({ heading: headingFocused, button: buttonFocused, link: linkFocused }),
  }
}

test('TOC setup has a stable server/client initial state', (t) => {
  const { state, app, documentListeners } = setup(t, { mount: false })
  assert.equal(state.isDesktop.value, true)
  assert.equal(app.isRightSidebarOpen, false)
  assert.equal(documentListeners.size, 0)
})

test('mobile toggle and Escape close the drawer and restore focus', async (t) => {
  const { state, app, documentListeners, focused } = setup(t)
  assert.equal(state.isDesktop.value, false)
  await state.toggleSidebar()
  assert.equal(app.isRightSidebarOpen, true)
  assert.equal(focused().link, 1)
  await state.toggleSidebar()
  assert.equal(app.isRightSidebarOpen, false)
  assert.equal(focused().button, 1)
  await state.toggleSidebar()
  let prevented = false
  documentListeners.get('keydown')({ key: 'Escape', preventDefault: () => { prevented = true } })
  assert.equal(app.isRightSidebarOpen, false)
  assert.equal(prevented, true)
  assert.equal(focused().button, 2)
})

test('mobile selection closes and focuses its heading while modified clicks remain available', async (t) => {
  const { state, app, heading, focused } = setup(t)
  const click = { button: 0, target: { closest: () => ({ hash: '#%E5%AD%A6%E4%B9%A0%E7%AB%A0%E8%8A%82' }) } }
  await state.toggleSidebar()
  state.handleOutlineClick({ ...click, ctrlKey: true })
  assert.equal(app.isRightSidebarOpen, true)
  state.handleOutlineClick(click)
  assert.equal(app.isRightSidebarOpen, false)
  assert.equal(heading.tabIndex, -1)
  assert.equal(focused().heading, 1)
})

test('desktop transitions close the mobile drawer and unmount removes global listeners', async (t) => {
  const { state, app, media, mediaListeners, documentListeners, unmount } = setup(t)
  await state.toggleSidebar()
  media.matches = true
  mediaListeners.get('change')()
  assert.equal(state.isDesktop.value, true)
  assert.equal(app.isRightSidebarOpen, false)
  app.toggleRightSidebar(true)
  state.handleOutlineClick({ button: 0, target: { closest: () => ({ hash: '#anything' }) } })
  assert.equal(app.isRightSidebarOpen, true, 'desktop outline clicks should not toggle the persistent sidebar')
  unmount()
  assert.equal(app.isRightSidebarOpen, false)
  assert.equal(documentListeners.size, 0)
  assert.equal(mediaListeners.size, 0)
})
