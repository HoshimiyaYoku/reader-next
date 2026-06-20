---
layout: home

hero:
  name: "Reader Next"
  text: "带 AI 阅读辅助的阅读 3.0 服务端"
  tagline: 自定义书源、服务端书架、本地 TXT、章节摘要、AI 资料和模型 provider preset，集中在一个 Rust + Vue 应用里。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: 章节摘要栏
      link: /guide/chapter-summary
    - theme: alt
      text: 近期变更
      link: /guide/recent-changes

features:
  - icon: 📖
    title: 阅读主链路
    details: 书源搜索、目录解析、章节缓存、服务端书架、跨设备进度和本地 TXT 都走同一套后端。
  - icon: ✦
    title: 章节摘要栏
    details: 阅读页侧边摘要支持自动生成、手动重生成、要点合并展示、隐藏状态持久化和详细程度控制。
  - icon: 🧠
    title: AI 资料
    details: 按已读章节整理剧情、世界观、角色、地点、关系和地图，适合长篇小说回顾。
  - icon: ⚙️
    title: Provider preset
    details: 文本模型接口路径可配置，兼容 OpenAI 风格网关、Responses、Claude/Gemini 兼容转发等常见部署。
---

## 当前定位

Reader Next 是一个独立维护的阅读服务端。它不追求做通用平台，优先把自用阅读体验做稳：书源阅读、本地 TXT、跨设备进度、AI 资料和章节摘要都围绕“长篇阅读不丢上下文”展开。

## 最近主线

- 摘要栏从普通卡片改成阅读页侧边栏，支持隐藏后刷新不自动弹出。
- 要点样式收敛为同一块内容，不再每条一个高亮框。
- 摘要生成的详细程度变成真实 prompt 约束：短、正常、详细会影响摘要长度和要点数量。
- 设置面板删掉重复开关，生成栏只保留必要控制。
- AI Text provider preset 支持可配置文本接口路径，减少不同模型网关的接入摩擦。
- 本地 TXT、AI 资料和跨设备进度继续保留为主线能力。

继续阅读：[近期变更](/guide/recent-changes)。
