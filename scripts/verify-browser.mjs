import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { resolve, relative } from 'node:path'
import { collectFiles } from './build-utils.mjs'

const base = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:4173'
const routes = {
  shor: '/posts/后量子密码学基础/学习工作区/02_数学与现代密码学按需回补/Shor算法所需的整数分解与离散对数',
  data: '/posts/静态代码分析/20240731 3 数据流分析-应用/20240731 3 数据流分析-应用',
  cfl: '/posts/静态代码分析/20240809 11 CFL 可达与 IFDS/20240809 11 CFL 可达与 IFDS',
  pointer: '/posts/静态代码分析/20240805 8 指针分析-上下文敏感/20240805 8 指针分析-上下文敏感',
  soundness: '/posts/静态代码分析/20240810 12 完全性与近似完全性/20240810 12 完全性与近似完全性',
}
const results = []
const runtimeErrors = []
const requestsFailed = []
const warnings = []
const httpErrors = []
let browser
let page

async function ready(target = '/') {
  const response = await page.goto(base + target, { waitUntil: 'domcontentloaded' })
  assert.equal(response.status(), 200)
  await page.locator('.yun-page-loading').waitFor({ state: 'hidden', timeout: 15000 })
  await page.waitForFunction(() => /本站已运行\d/.test(document.querySelector('.statistics')?.textContent || ''))
}

async function scenario(name, fn) {
  if (process.env.BROWSER_SCENARIO && process.env.BROWSER_SCENARIO !== name)
    return
  try {
    const details = await fn()
    results.push({ name, status: 'passed', details })
  }
  catch (error) {
    results.push({ name, status: 'failed', error: error.message })
    await page.screenshot({ path: `.cache/acceptance/${name}-failure.png` }).catch(() => {})
  }
  console.log(JSON.stringify(results.at(-1)))
}

async function layout() {
  return page.evaluate(() => ({
    viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
    wide: [...document.querySelectorAll('.markdown-body table, .markdown-body pre, .markdown-body math[display="block"], .markdown-body iframe')].map(el => {
      const bounds = el.getBoundingClientRect()
      const scrollParents = []
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 2)
          scrollParents.push({ tag: p.tagName, class: p.className, width: p.clientWidth, scrollWidth: p.scrollWidth })
      }
      return { tag: el.tagName, left: bounds.left, right: bounds.right, width: bounds.width, text: el.textContent.slice(0, 65), scrollParents }
    }).filter(el => el.width > innerWidth || el.left < -1 || el.right > innerWidth + 1),
  }))
}

;(async () => {
  await fs.mkdir('.cache/acceptance', { recursive: true })
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', colorScheme: 'light', reducedMotion: 'reduce' })
  page = await context.newPage()
  page.on('pageerror', error => runtimeErrors.push({ url: page.url(), message: error.message }))
  page.on('requestfailed', request => requestsFailed.push({ url: request.url(), error: request.failure()?.errorText }))
  page.on('response', response => {
    if (response.url().startsWith(base) && response.status() >= 400)
      httpErrors.push({ url: response.url(), status: response.status() })
  })
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) warnings.push({ url: page.url(), type: message.type(), text: message.text() })
  })
  page.setDefaultTimeout(10000)

  await scenario('desktop-home', async () => {
    await ready()
    assert.equal(await page.locator('.post-title-link').count(), 7)
    assert.equal(await page.locator('.say-entry.is-active').count(), 1)
    assert.equal(await page.locator('.say-entry[aria-hidden="false"]').count(), 1)
    const searchIcon = await page.locator('[i-ri-search-line]').evaluate(element => ({
      mask: getComputedStyle(element).maskImage,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }))
    assert.notEqual(searchIcon.mask, 'none', 'Search icon must have generated CSS, including IDE builds')
    assert.ok(searchIcon.width > 0 && searchIcon.height > 0)
    const before = await page.locator('.statistics').textContent()
    await page.waitForFunction(previous => document.querySelector('.statistics').textContent !== previous, before)
    const dimensions = await layout()
    assert.equal(dimensions.documentWidth, 1440)
    await page.screenshot({ path: '.cache/acceptance/home-desktop.png' })
    await page.locator('.post-title-link').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: '.cache/acceptance/home-posts.png' })
    return { cards: 7, footerBefore: before, footerAfter: await page.locator('.statistics').textContent() }
  })

  await scenario('pagination-navigation-refresh', async () => {
    await ready()
    const first = await page.locator('.post-title-link').first().textContent()
    await page.locator('a.page-number[aria-label="next"]').click()
    await page.waitForURL('**/page/2')
    assert.equal((await page.locator('.page-number.active').textContent()).trim(), '2')
    assert.notEqual(await page.locator('.post-title-link').first().textContent(), first)
    assert.equal((await page.reload({ waitUntil: 'domcontentloaded' })).status(), 200)
    await page.locator('.yun-page-loading').waitFor({ state: 'hidden' })
    assert.equal((await page.locator('.page-number.active').textContent()).trim(), '2')
    await page.goto(base + '/page/5')
    assert.equal(await page.locator('a.page-number[aria-label="next"]').count(), 0)
    return { secondPageReload: true, finalPageHasNoNext: true }
  })

  await scenario('search-deep-route-refresh', async () => {
    await ready()
    await page.locator('.yun-search-btn').click()
    await page.locator('.yun-search-input').fill('Shor')
    const result = page.locator('.yun-fuse-result-item').filter({ hasText: '数学补给 01' }).first()
    await result.waitFor({ state: 'visible' })
    await result.click()
    await page.waitForURL(url => decodeURI(url.pathname) === routes.shor)
    await page.locator('.yun-search-input').waitFor({ state: 'hidden' })
    assert.match(await page.locator('h1').first().textContent(), /Shor/)
    assert.equal((await page.reload({ waitUntil: 'domcontentloaded' })).status(), 200)
    await page.locator('.yun-page-loading').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN')
    return { resultNavigation: true, chineseRouteReload: true, title: await page.title() }
  })

  await scenario('dark-containers', async () => {
    await ready(routes.data)
    await page.getByTitle('切换深色模式', { exact: true }).click()
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    // Wait until the theme's View Transition has replaced the old light snapshot.
    await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.pseudoElement?.startsWith('::view-transition')).map(animation => animation.finished.catch(() => {})))
    })
    const colors = await page.evaluate(() => ['definition', 'theorem', 'algorithm', 'conclusion'].map(name => {
      const element = document.querySelector(`.${name}`)
      const body = element.querySelector('p:not(.title)') || element
      return { name, background: getComputedStyle(element).backgroundColor, text: getComputedStyle(body).color }
    }))
    for (const item of colors) assert.ok(!item.background.includes('240, 244, 248'), item.name)
    await page.locator('.definition').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: '.cache/acceptance/dark-containers.png' })
    await page.getByTitle('切换亮色模式', { exact: true }).click()
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))
    return colors
  })

  await scenario('mobile-toc-table', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(routes.shor)
    await page.locator('.toc-btn').click()
    await page.locator('.yun-aside.open').waitFor({ state: 'visible' })
    const link = page.locator('.outline-link').filter({ hasText: '七、整数分解为什么会变成阶查找' }).first()
    await link.click()
    await page.waitForFunction(() => decodeURIComponent(location.hash).includes('七、整数分解为什么会变成阶查找'))
    const target = page.locator('[id="七、整数分解为什么会变成阶查找"]')
    const position = await target.boundingBox()
    assert.ok(position.y >= -10 && position.y < 250, JSON.stringify(position))
    await page.waitForFunction(() => !document.querySelector('.yun-aside.open'))
    assert.equal(await page.locator('.toc-btn').getAttribute('aria-expanded'), 'false')
    await page.locator('.toc-btn').click()
    assert.equal(await page.locator('.toc-btn').getAttribute('aria-expanded'), 'true')
    await page.locator('.toc-btn').click()
    await page.waitForFunction(() => !document.querySelector('.yun-aside.open'))
    await page.locator('.toc-btn').click()
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.yun-aside.open'))
    await page.locator('[id="九、把数学映射回区块链"]').scrollIntoViewIfNeeded()
    const dimensions = await layout()
    assert.ok(dimensions.documentWidth <= 391, JSON.stringify(dimensions))
    await page.screenshot({ path: '.cache/acceptance/mobile-table.png' })
    return { dimensions, tocPosition: position, tocAutoClosed: true, toggleAndEscape: true }
  })

  await scenario('mobile-navigation', async () => {
    await ready()
    const toggle = page.getByRole('button', { name: 'mobile navigation', exact: true })
    await toggle.click()
    await page.locator('.sidebar.open').waitFor({ state: 'visible' })
    await toggle.click()
    await page.waitForFunction(() => !document.querySelector('.sidebar.open'))
    assert.ok((await layout()).documentWidth <= 391)
    return { openAndClose: true }
  })

  await scenario('narrow-math-layout', async () => {
    await page.setViewportSize({ width: 320, height: 740 })
    await ready(routes.cfl)
    await page.locator('[id="_11-3-1-概念"]').scrollIntoViewIfNeeded()
    const dimensions = await layout()
    await page.screenshot({ path: '.cache/acceptance/narrow-math.png' })
    assert.ok(dimensions.documentWidth <= 321, JSON.stringify(dimensions))
    const formulas = await page.locator('.katex:has(> math[display="block"])').evaluateAll(elements => elements.filter(e => e.scrollWidth > e.clientWidth + 2).map(e => {
      e.scrollLeft = e.scrollWidth
      const reachedEnd = e.scrollLeft + e.clientWidth >= e.scrollWidth - 2
      e.scrollLeft = 0
      const startVisible = e.querySelector('semantics').getBoundingClientRect().left >= e.getBoundingClientRect().left - 2
      return { width: e.clientWidth, scrollWidth: e.scrollWidth, reachedEnd, startVisible }
    }))
    assert.ok(formulas.length > 0, 'Expected wide math formulas')
    assert.ok(formulas.every(formula => formula.reachedEnd), 'Formula end must remain reachable')
    assert.ok(formulas.every(formula => formula.startVisible), 'Formula start must remain visible')
    const widestIndex = await page.locator('.katex').evaluateAll(elements => elements.reduce((best, element, index) => element.scrollWidth > elements[best].scrollWidth ? index : best, 0))
    const widest = page.locator('.katex').nth(widestIndex)
    await widest.scrollIntoViewIfNeeded()
    await page.screenshot({ path: '.cache/acceptance/narrow-math-start.png' })
    await widest.evaluate(element => { element.scrollLeft = element.scrollWidth })
    await page.screenshot({ path: '.cache/acceptance/narrow-math-end.png' })
    return { ...dimensions, formulas }
  })

  await scenario('webp-images', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    const images = []
    for (const [route, expected] of [[routes.cfl, [['jdk-cfg', 2266, 1352], ['alg-eg', 2880, 1146], ['cfl-reachable', 2792, 1010]]], [routes.pointer, [['cs-heap', 2880, 1612]]], [routes.soundness, [['safe', 2864, 1162]]]]) {
      await ready(route)
      for (const [alt, width, height] of expected) {
        const image = page.locator(`img[alt="${alt}"]`)
        await image.scrollIntoViewIfNeeded()
        await image.evaluate(image => image.decode())
        const dimensions = await image.evaluate(image => ({ alt: image.alt, src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight, renderedWidth: image.getBoundingClientRect().width }))
        assert.equal(dimensions.width, width)
        assert.equal(dimensions.height, height)
        assert.match(dimensions.src, /\.webp(?:$|\?)/)
        assert.ok(dimensions.renderedWidth <= 390)
        images.push(dimensions)
      }
    }
    await page.screenshot({ path: '.cache/acceptance/mobile-webp.png' })
    return images
  })

  await scenario('mobile-iframe', async () => {
    await ready(routes.data)
    const iframe = page.locator('iframe[src="/posts/StaticAnalytics/03-dfa-ap/reaching-definition.html"]')
    await iframe.scrollIntoViewIfNeeded()
    const frame = await (await iframe.elementHandle()).contentFrame()
    await frame.waitForLoadState('domcontentloaded')
    const content = await frame.locator('body').innerText()
    assert.ok(content.length > 100, content)
    const dimensions = await layout()
    assert.ok(dimensions.documentWidth <= 391, JSON.stringify(dimensions))
    await page.screenshot({ path: '.cache/acceptance/mobile-iframe.png' })
    return { textLength: content.length, frameErrors: await frame.locator('.katex-error').count(), dimensions }
  })

  await scenario('offline-algorithm-demos', async () => {
    const publicDir = resolve('public')
    const files = (await collectFiles(resolve(publicDir, 'posts/StaticAnalytics'))).filter(file => file.endsWith('.html'))
    assert.ok(files.length > 0)
    const externalRequests = []
    const blockExternal = route => {
      if (!route.request().url().startsWith(base)) {
        externalRequests.push(route.request().url())
        return route.abort()
      }
      return route.continue()
    }
    await page.route('**/*', blockExternal)
    const demos = []
    try {
      for (const file of files) {
        const url = `/${relative(publicDir, file).replaceAll('\\', '/')}`
        const response = await page.goto(base + url)
        assert.equal(response.status(), 200, url)
        await page.evaluate(() => document.fonts.ready)
        const math = await page.locator('.katex-html').count()
        assert.ok(math > 0, `${url}: rendered formulas`)
        assert.equal(await page.locator('.katex-error').count(), 0, url)
        const failedFonts = await page.evaluate(() => [...document.fonts].filter(font => font.status === 'error').length)
        assert.equal(failedFonts, 0, url)
        demos.push({ url, math })
      }
      assert.deepEqual(externalRequests, [])
    }
    finally { await page.unroute('**/*', blockExternal) }
    return { count: demos.length, externalRequests: externalRequests.length, demos }
  })

  const report = { browser: browser.version(), results, runtimeErrors, httpErrors, requestsFailed, warnings }
  const suffix = process.env.BROWSER_SCENARIO ? `-${process.env.BROWSER_SCENARIO.replace(/[^a-z0-9-]/gi, '')}` : ''
  await fs.writeFile(`.cache/acceptance/browser-results${suffix}.json`, JSON.stringify(report, null, 2))
  await browser.close()
  const localFailures = requestsFailed.filter(request => request.url.startsWith(base) && request.error !== 'net::ERR_ABORTED')
  const preloadWarnings = warnings.filter(message => /preload.*credentials mode|preloaded.*not used/i.test(message.text))
  console.log(JSON.stringify({ passed: results.filter(test => test.status === 'passed').length, total: results.length, runtimeErrors: runtimeErrors.length, httpErrors: httpErrors.length, localFailures: localFailures.length, preloadWarnings: preloadWarnings.length }))
  process.exitCode = !results.length || results.some(test => test.status === 'failed') || runtimeErrors.length || httpErrors.length || localFailures.length || preloadWarnings.length ? 1 : 0
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })
