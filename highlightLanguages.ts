import type { Highlighter, LanguageInput } from 'shiki'
import type { Plugin } from 'vite'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { bundledLanguagesInfo } from 'shiki/langs'

interface HighlightLanguageOptions {
  root?: string
  languages?: LanguageInput[]
  defaultHighlightLang?: string
  languageAlias?: Record<string, string>
  shikiSetup?: (highlighter: Highlighter) => void | Promise<void>
}

const parser = new MarkdownIt({ html: true })
const plainLanguages = new Set(['', 'txt', 'text', 'plaintext', 'plain', 'ansi', 'mermaid', 'mmd'])
const languageInfo = new Map(bundledLanguagesInfo.flatMap(info =>
  [info.id, ...(info.aliases || [])].map(name => [name, info] as const),
))

/** Match the fence labels passed to Valaxy 0.19.5's Shiki callback. */
export function normalizeFenceLanguage(info: string): string {
  const label = parser.utils.unescapeAll(info)
    .replace(/\[.*\]/, '')
    .replace(/\{[\d,-]+\}/, '')
    .trim()
    .split(/\s+/, 1)[0]
  return label.replace(/=(\d*)/, '')
    .replace(/:(no-)?line-numbers(=\d*)?$/, '')
    .replace(/-vue$/, '')
    .toLowerCase()
}

function resolveLanguage(name: string, aliases: Record<string, string>) {
  const visited = new Set<string>()
  while (aliases[name]) {
    if (visited.has(name))
      return
    visited.add(name)
    name = aliases[name].toLowerCase()
  }
  return plainLanguages.has(name) ? undefined : languageInfo.get(name)
}

export function collectFenceLanguages(source: string, aliases: Record<string, string> = {}): string[] {
  // Frontmatter is removed before Valaxy renders Markdown as well.
  const content = source.replace(/^\uFEFF?---[^\S\r\n]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/, '')
  const names = new Set<string>()
  for (const token of parser.parse(content, {})) {
    if (token.type !== 'fence')
      continue
    const info = resolveLanguage(normalizeFenceLanguage(token.info), aliases)
    if (info)
      names.add(info.id)
  }
  return [...names].sort()
}

function markdownFiles(directory: string): string[] {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return []
    throw error
  }
  return entries.flatMap(entry => entry.isDirectory()
    ? markdownFiles(resolve(directory, entry.name))
    : entry.isFile() && entry.name.endsWith('.md') ? [resolve(directory, entry.name)] : [])
}

/** Scan once for startup, then load new fence grammars before Markdown HMR. */
export function createHighlightLanguages(options: HighlightLanguageOptions = {}) {
  const pagesRoot = resolve(options.root || dirname(fileURLToPath(import.meta.url)), 'pages')
  const aliases = options.languageAlias || {}
  const names = new Set<string>()
  for (const file of markdownFiles(pagesRoot)) {
    for (const name of collectFenceLanguages(readFileSync(file, 'utf8'), aliases))
      names.add(name)
  }
  const fallback = resolveLanguage((options.defaultHighlightLang || '').toLowerCase(), aliases)
  if (fallback)
    names.add(fallback.id)

  const explicit = options.languages || []
  const explicitNames = new Set(explicit.flatMap(input =>
    (Array.isArray(input) ? input : [input]).flatMap(value =>
      value && typeof value === 'object' && 'name' in value ? [value.name] : []),
  ))
  const languages: LanguageInput[] = [...new Set([
    ...[...names].sort().filter(name => !explicitNames.has(name)).map(name => languageInfo.get(name)!.import),
    ...explicit,
  ])]
  const highlighters = new Set<Highlighter>()
  const pending = new WeakMap<Highlighter, Map<string, Promise<void>>>()

  async function loadMissing(highlighter: Highlighter, selected: string[], warn: (message: string) => void) {
    let loading = pending.get(highlighter)
    if (!loading) {
      loading = new Map()
      pending.set(highlighter, loading)
    }
    await Promise.all(selected.map(async (name) => {
      if (highlighter.getLoadedLanguages().includes(name))
        return
      let task = loading!.get(name)
      if (!task) {
        task = highlighter.loadLanguage(languageInfo.get(name)!.import).catch((error) => {
          warn(`Could not load the '${name}' grammar; Valaxy will use its normal highlighting fallback. ${String(error)}`)
        }).finally(() => loading!.delete(name))
        loading!.set(name, task)
      }
      await task
    }))
  }

  async function prepareSource(source: string, warn: (message: string) => void) {
    const selected = collectFenceLanguages(source, aliases)
    selected.forEach(name => names.add(name))
    await Promise.all([...highlighters].map(highlighter => loadMissing(highlighter, selected, warn)))
  }

  function isMarkdownPage(filename: string) {
    if (!filename.endsWith('.md'))
      return false
    const path = relative(pagesRoot, resolve(filename))
    return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
  }

  const plugin: Plugin = {
    name: 'load-markdown-highlight-languages',
    enforce: 'pre',
    // A transform barrier also covers newly created files and direct requests.
    transform: {
      order: 'pre',
      async handler(source, id) {
        if (isMarkdownPage(id))
          await prepareSource(source, message => this.warn(message))
        return null
      },
    },
    async handleHotUpdate(context) {
      if (isMarkdownPage(context.file)) {
        try {
          await prepareSource(await context.read(), message => context.server.config.logger.warn(message))
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            throw error
        }
      }
      // Leave Vite's normal module invalidation and HMR behavior intact.
    },
  }

  return {
    languages,
    plugin,
    get languageNames() { return [...names].sort() },
    async shikiSetup(highlighter: Highlighter) {
      await options.shikiSetup?.(highlighter)
      highlighters.add(highlighter)
      await loadMissing(highlighter, [...names], message => console.warn(message))
    },
  }
}
