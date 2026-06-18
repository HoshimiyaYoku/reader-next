# 简介

Reader Next 是一个独立维护的阅读 3.0 Rust 服务端，提供书源管理、书籍搜索、章节解析、服务端书架、缓存、RSS、TTS、本地 TXT 上传和 AI 资料能力。

它从 Reader Next 代码基础继续演进，但当前主线会优先按 `reader-next` 的使用体验和重构节奏推进。

## 当前重点

- **新版前端**：`frontend/`，Vue 3 + Vite + TypeScript + Pinia。
- **服务端书架**：远程书源书籍和上传的本地 TXT 都进入统一书架。
- **跨设备进度**：打开书籍和恢复会话时同步服务端最新阅读进度。
- **本地 TXT**：支持上传、解析目录、阅读正文、删除导入文件。
- **AI 资料**：围绕已读章节整理摘要、世界观、角色、关系和地图。
- **文档站**：GitHub Pages 发布到 `https://maple0517.github.io/reader-next/`。

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
- `src/service/`：业务逻辑。
- `src/parser/`：规则解析引擎。
- `src/crawler/`：HTTP 抓取。
- `src/storage/`：SQLite 和文件缓存。
- `frontend/`：Vue 3 + Vite 前端。
- `docs/`：VitePress 文档站。

## 下一步

- [快速开始](./quickstart)
- [近期变更](./recent-changes)
- [功能特性](./features)
- [AI 资料](./ai-book)
- [API 文档](../api/)
