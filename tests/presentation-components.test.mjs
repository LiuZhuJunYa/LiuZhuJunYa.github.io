import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import { renderToString } from '@vue/server-renderer'
import ts from 'typescript'
import { createRenderer, createSSRApp, h, nextTick } from 'vue'

const require = createRequire(import.meta.url)
const themeFooter = {
  setup: (_props, { slots }) => () => h('footer', slots.default?.()),
}

function loadComponent(name) {
  const filename = new URL(`../components/${name}.vue`, import.meta.url)
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
  const compiled = compileScript(descriptor, { id: name, inlineTemplate: true })
  const { outputText } = ts.transpileModule(compiled.content, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  })
  const componentModule = { exports: {} }
  const componentRequire = id => id.endsWith('/components/YunFooter.vue') ? themeFooter : require(id)
  new Function('require', 'module', 'exports', outputText)(componentRequire, componentModule, componentModule.exports)
  return componentModule.exports.default
}

// Run actual Vue component setup, rendering, updates and unmount hooks without a browser.
function mountComponent(component) {
  const node = (type, text = '') => ({ type, text, children: [], props: {}, parent: null })
  const detach = (child) => {
    if (child.parent) {
      const index = child.parent.children.indexOf(child)
      if (index !== -1)
        child.parent.children.splice(index, 1)
    }
    child.parent = null
  }
  const renderer = createRenderer({
    createElement: type => node(type),
    createText: text => node('#text', text),
    createComment: text => node('#comment', text),
    setText: (target, text) => { target.text = text },
    setElementText: (target, text) => { target.text = text; target.children = [] },
    patchProp: (target, key, _previous, value) => { target.props[key] = value },
    insert(child, parent, anchor = null) {
      detach(child)
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
      child.parent = parent
    },
    remove: detach,
    parentNode: target => target.parent,
    nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] || null,
    setScopeId() {},
  })
  const root = node('root')
  const app = renderer.createApp(component)
  app.mount(root)
  return { app, root }
}

function textContent(node) {
  return (node.type === '#comment' ? '' : node.text) + node.children.map(textContent).join('')
}

function findNodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => findNodes(child, predicate))]
}

const Footer = loadComponent('YunFooter')
const Say = loadComponent('YunSay')

test('footer SSR uses stable placeholders and starts no timer', async (t) => {
  const timer = t.mock.method(globalThis, 'setInterval')
  const html = await renderToString(createSSRApp(Footer))
  assert.equal((html.match(/>—<\/span>/g) || []).length, 4)
  assert.equal(timer.mock.callCount(), 0)
})

test('footer updates immediately, stays timezone independent, ticks and releases its timer', async (t) => {
  const originalTimezone = process.env.TZ
  t.after(() => {
    if (originalTimezone === undefined)
      delete process.env.TZ
    else
      process.env.TZ = originalTimezone
  })
  let now = Date.parse('2026-10-24T12:00:00+08:00')
  let tick
  const timerHandle = {}
  const timer = t.mock.method(globalThis, 'setInterval', (callback, delay) => {
    assert.equal(delay, 1000)
    tick = callback
    return timerHandle
  })
  const clear = t.mock.method(globalThis, 'clearInterval', handle => assert.equal(handle, timerHandle))
  t.mock.method(Date, 'now', () => now)

  for (const timezone of ['Asia/Shanghai', 'UTC', 'America/Los_Angeles']) {
    process.env.TZ = timezone
    now = Date.parse('2026-10-24T12:00:00+08:00')
    const { app, root } = mountComponent(Footer)
    await nextTick()
    assert.match(textContent(root), /本站已运行818天2小时0分钟0秒/, timezone)
    now += 1000
    tick()
    await nextTick()
    assert.match(textContent(root), /818天2小时0分钟1秒/, timezone)
    app.unmount()
  }
  assert.equal(timer.mock.callCount(), 3)
  assert.equal(clear.mock.callCount(), 3)
})

test('sayings have deterministic SSR content and randomize only after mounting', async (t) => {
  const random = t.mock.method(Math, 'random', () => 0.99)
  const html = await renderToString(createSSRApp(Say))
  assert.equal(random.mock.callCount(), 0)
  assert.equal((html.match(/aria-hidden="false"/g) || []).length, 1)
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, 2)
  assert.match(html, /say-entry is-active[^>]*aria-hidden="false"[^>]*><span[^>]*>路旁青衣/)

  const { app, root } = mountComponent(Say)
  await nextTick()
  const entries = findNodes(root, node => node.props.class?.split(' ').includes('say-entry'))
  assert.equal(entries.length, 3)
  assert.equal(entries.filter(node => node.props['aria-hidden'] === false).length, 1)
  assert.equal(entries[2].props['aria-hidden'], false)
  assert.match(textContent(entries[2]), /我们都是小怪兽/)
  assert.equal(random.mock.callCount(), 1)
  app.unmount()
})
