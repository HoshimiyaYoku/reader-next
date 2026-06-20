import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/reader-next/',
  title: 'Reader Next',
  description: '带 AI 阅读辅助的阅读 3.0 Rust 服务端',

  head: [
    ['meta', { name: 'theme-color', content: '#111827' }],
    ['meta', { property: 'og:title', content: 'Reader Next' }],
    ['meta', { property: 'og:description', content: '带 AI 阅读辅助的阅读 3.0 Rust 服务端' }]
  ],

  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: '书源', link: '/book-source/' },
      { text: 'GitHub', link: 'https://github.com/Maple0517/reader-next' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '简介', link: '/guide/' },
            { text: '快速开始', link: '/guide/quickstart' },
            { text: '近期变更', link: '/guide/recent-changes' },
            { text: '章节摘要栏', link: '/guide/chapter-summary' },
            { text: '配置', link: '/guide/configuration' },
            { text: '功能特性', link: '/guide/features' },
            { text: '用户手册', link: '/guide/user-manual' },
            { text: 'AI 资料', link: '/guide/ai-book' },
            { text: '测试流程', link: '/guide/testing' }
          ]
        },
      ],
      '/api/': [
        {
          text: 'API参考',
          items: [
            { text: '概述', link: '/api/' },
            { text: '书源管理', link: '/api/book-source' },
            { text: '书籍搜索', link: '/api/search' },
            { text: '章节内容', link: '/api/chapter' },
            { text: '用户管理', link: '/api/user' },
            { text: 'RSS订阅', link: '/api/rss' }
          ]
        }
      ],
      '/book-source/': [
        {
          text: '书源开发',
          items: [
            { text: '概述', link: '/book-source/' },
            { text: '规则语法', link: '/book-source/rules' },
            { text: '搜索规则', link: '/book-source/search-rule' },
            { text: '书籍信息', link: '/book-source/book-info' },
            { text: '目录规则', link: '/book-source/toc-rule' },
            { text: '正文规则', link: '/book-source/content-rule' },
            { text: 'JavaScript', link: '/book-source/javascript' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Maple0517/reader-next' }
    ],

    editLink: {
      pattern: 'https://github.com/Maple0517/reader-next/edit/main/docs/:path'
    }
  }
})
