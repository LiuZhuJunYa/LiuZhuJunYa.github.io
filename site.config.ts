import type { UserSiteConfig } from 'valaxy/types'
// site.config.ts

export default {
  url: 'https://liuzhujunya.top/',
  lang: 'zh-CN',
  pageSize: 7,
  title: '流竹筠雅の家',
  subtitle: 'I Fall Apart',
  description: '希望能成为一个有趣的人',
  author: {
    name: '流竹筠雅',
    avatar: '/avatar.jpg',
    status: {
      emoji: '🤡',
    },
  },
  favicon: '/favicon.svg',
  // description: 'Valaxy Theme Yun Preview.',
  search: {
    enable: true,
    // 设置类型为 Fuse
    type: 'fuse',
  },
  social: [
    {
      name: 'RSS',
      link: '/atom.xml',
      icon: 'i-ri-rss-line',
      color: 'orange',
    },
    {
      name: 'GitHub',
      link: 'https://github.com/LiuZhuJunYa',
      icon: 'i-ri-github-line',
      color: '#6e5494',
    },
    {
      name: '网易云音乐',
      link: 'https://music.163.com/#/user/home?id=1371064945',
      icon: 'i-ri-netease-cloud-music-line',
      color: '#C20C0C',
    },
    {
      name: '哔哩哔哩',
      link: 'https://space.bilibili.com/482465495',
      icon: 'i-ri-bilibili-line',
      color: '#FF8EB3',
    },
  ],

  sponsor: {
    enable: true,
    title: '我很可爱，请给我钱！',
    methods: [
      {
        name: '支付宝',
        url: '/alipay-qrcode.jpg',
        color: '#00A3EE',
        icon: 'i-ri-alipay-line',
      },
      {
        name: 'QQ 支付',
        url: '/qqpay-qrcode.png',
        color: '#12B7F5',
        icon: 'i-ri-qq-line',
      },
      {
        name: '微信支付',
        url: '/wechatpay-qrcode.jpg',
        color: '#2DC100',
        icon: 'i-ri-wechat-pay-line',
      },
    ],
  },
} satisfies UserSiteConfig
