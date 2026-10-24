import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import markdownItContainer from 'markdown-it-container'

const containerTypes = ['definition', 'theorem', 'algorithm', 'conclusion'] as const

export default function extendMarkdown(md: MarkdownIt) {
  for (const name of containerTypes) {
    const titlePattern = new RegExp(`^${name}\\s+(.+)$`)
    md.use(markdownItContainer, name, {
      validate: (params: string) => titlePattern.test(params.trim()),
      render: (tokens: Token[], idx: number) => {
        if (tokens[idx].nesting !== 1)
          return '</div>\n'

        const title = titlePattern.exec(tokens[idx].info.trim())?.[1] || ''
        return `<div class="${name}"><p class="title">${md.utils.escapeHtml(title)}</p>\n`
      },
    })
  }
}
