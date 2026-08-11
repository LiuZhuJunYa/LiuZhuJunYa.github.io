import { defineValaxyConfig } from 'valaxy'
import type { UserThemeConfig } from 'valaxy-theme-yun'
import { addonComponents } from 'valaxy-addon-components'
import extendMarkdown from './components/extendMarkdown'
import { fixNestedChineseRoutes } from './fixNestedChineseRoutes'
// add icons what you will need
const safelist = [
  'i-ri-home-line',
]

/**
 * User Config
 */
export default defineValaxyConfig<UserThemeConfig>({
  vite: {
    publicDir: 'public',
    plugins: [fixNestedChineseRoutes()],
  },
  markdown: {
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
    addonComponents(),
  ],

  theme: 'yun',

  themeConfig: {
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

  unocss: { safelist },
})
