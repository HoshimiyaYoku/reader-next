---
layout: home

hero:
  name: "Reader Next"
  text: "独立维护的阅读 3.0 Rust 服务端"
  tagline: 自定义书源、服务端书架、本地 TXT、跨设备进度和 AI 资料的一体化阅读服务。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: 近期变更
      link: /guide/recent-changes
    - theme: alt
      text: 用户手册
      link: /guide/user-manual

features:
  - icon: ⚡
    title: Rust 服务端
    details: 基于 axum、tokio、reqwest 和 SQLite，负责书源解析、缓存、书架和用户数据。
  - icon: 📚
    title: 服务端书架
    details: 支持远程书源书籍和本地 TXT 上传，书籍可在同一服务端账号下跨设备阅读。
  - icon: 🔁
    title: 进度同步
    details: 打开书籍和恢复会话时优先使用服务端最新阅读进度，减少多设备读偏。
  - icon: 🧠
    title: AI 资料
    details: 按已读章节整理世界观、角色、关系和地图，并保留生成结果中的图片资料。
---

## Reader Next

Reader Next 从 `reader-rust` 代码基础继续演进，当前主线会优先服务自用体验、稳定阅读流程和后续大重构。

这个仓库不是 GitHub fork，但本地仍保留 `upstream` 远端，方便以后按需同步原项目更新。

## 近期主线

- 保留 AI 地图生成后的图片结果，避免成功生成后又退回纯关系图。
- 新增本地 TXT 小说上传，上传后进入服务端书架并支持目录、正文、删除和缓存语义。
- 隐藏本地 TXT 书籍不适用的远程缓存标签，减少 UI 误导。
- 修复本地 TXT 相邻章节边界导致的阅读异常。
- 打开书籍和恢复会话时同步服务端最新阅读进度。
- GitHub Pages 文档站切换到 `reader-next`。

继续阅读：[近期变更](/guide/recent-changes)。
