import type { UserValaxyNodeConfig } from 'valaxy'
import type { UserThemeConfig } from 'valaxy-theme-yun/theme'
import { icons as remixIcons } from '@iconify-json/ri'
import extendMarkdown from './components/extendMarkdown'
import { fixNestedChineseRoutes } from './fixNestedChineseRoutes'
import { createPaginationRoutes } from './paginationRoutes'
import siteConfig from './site.config'
import { fixOptionalAddonImports } from './fixOptionalAddonImports'
import { createHighlightLanguages } from './highlightLanguages'

const highlighting = createHighlightLanguages()
// add icons what you will need
const safelist = [
  'i-ri-home-line',
]

/**
 * User Config
 */
export default {
  // Writing posts needs hot reload, but not the component inspection toolchain.
  devtools: process.env.BLOG_DEVTOOLS === '1',
  build: {
    // The built-in counter includes directory routes; use actual visible posts below.
    ssgForPagination: false,
  },
  vite: {
    publicDir: 'public',
    plugins: [fixNestedChineseRoutes(), fixOptionalAddonImports(), highlighting.plugin],
    server: {
      watch: { ignored: ['**/.cache/**'] },
    },
    css: {
      preprocessorMaxWorkers: 0,
      preprocessorOptions: {
        scss: { api: 'modern' },
      },
    },
    ssgOptions: {
      includedRoutes: (paths, routes) => createPaginationRoutes(paths, routes, siteConfig.pageSize ?? 7),
    },
  },
  markdown: {
    languages: highlighting.languages,
    shikiSetup: highlighting.shikiSetup,
    /**
     * KaTeX options
     * @see https://katex.org/docs/options.html
     */
    katex: {
      displayMode: true,
      output: 'mathml',
      fleqn: false,
      throwOnError: false,
      errorColor: '#cc0000',
      globalGroup: true,
    },
    config: (md) => {
      extendMarkdown(md)
    },
  },

  // site config see site.config.ts
  addons: [
    'valaxy-addon-components',
  ],

  theme: 'yun',

  themeConfig: {
    bg_image: {
      enable: true,
      url: '/images/pikachu-garden.jpg',
      dark: '/images/pikachu-garden.jpg',
      opacity: 0.55,
    },
    banner: {
      enable: true,
      title: '流竹君的小站',
      cloud: {
        enable: true,
      },
    },

    pages: [
      {
        name: '我的小伙伴们',
        url: '/links/',
        icon: 'i-ri-genderless-line',
        color: 'dodgerblue',
      },
      {
        name: '喜欢的女孩子',
        url: '/girls/',
        icon: 'i-ri-women-line',
        color: 'hotpink',
      },
    ],

    footer: {
      since: 2023,
      beian: {
        enable: false,
        icp: '苏ICP备17038157号',
      },
    },
  },

  // UnoCSS 0.61 disables its Node icon loader when launched from VS Code.
  // Supplying the collection explicitly keeps IDE and CI builds consistent.
  unocssPresets: {
    icons: {
      collections: { ri: () => remixIcons },
    },
  },
  unocss: { safelist },
} satisfies UserValaxyNodeConfig<UserThemeConfig>
