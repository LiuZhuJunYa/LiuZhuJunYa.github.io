declare module 'markdown-it-container' {
  import type { PluginWithOptions } from 'markdown-it'
  import type Token from 'markdown-it/lib/token.mjs'

  interface ContainerOptions {
    validate?: (params: string) => boolean
    render?: (tokens: Token[], idx: number) => string
  }

  const container: PluginWithOptions<ContainerOptions>
  export default container
}
