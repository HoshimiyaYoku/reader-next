# 简介

Reader Next 是一个独立维护的阅读 3.0 Rust 服务端，前端使用 Vue 3。它把书源阅读、服务端书架、本地 TXT、跨设备进度和 AI 阅读辅助放在同一个应用里。

## 当前重点

- **阅读体验**：阅读页、目录、设置、TTS、章节缓存和进度恢复。
- **服务端书架**：远程书源书籍和本地 TXT 使用统一书架。
- **章节摘要栏**：在阅读页侧边显示本章摘要和要点，支持自动生成与手动重生成。
- **AI 资料**：按已读章节维护剧情、世界观、角色、关系和地图资料。
- **Provider preset**：文本模型接口路径可配置，便于接入不同 OpenAI 兼容网关。
- **单端口开发**：默认 `18080`，Rust 服务端直接提供前端静态文件和 API。

## 架构概览

```text
Vue 3 前端
  -> /reader3 API
  -> axum handler
  -> service
  -> crawler / parser / storage
  -> SQLite + 文件缓存
```

## 主要目录

- `src/api/`：HTTP handlers 和路由。
- `src/service/`：书源、书架、AI、章节摘要等业务逻辑。
- `src/parser/`：规则解析引擎。
- `src/crawler/`：HTTP 抓取。
- `src/storage/`：SQLite 和文件缓存。
- `frontend/`：Vue 3 + Vite 前端。
- `docs/`：VitePress 文档站。

## 下一步

- [快速开始](./quickstart)
- [章节摘要栏](./chapter-summary)
- [AI 资料](./ai-book)
- [近期变更](./recent-changes)
- [API 文档](../api/)
