# 功能特性

Reader Next 当前由 Rust 后端和 Vue 3 前端组成，重点覆盖书源阅读、服务端书架、跨设备进度、本地 TXT 和 AI 资料。

## 前端

- `frontend/`：Vue 3 + Vite + TypeScript + Pinia。
- 响应式书架、最近阅读、分组和批量管理。
- 搜索结果、书籍详情、加入书架。
- 阅读器目录、设置、书签、书源切换、章节搜索、TTS、自动阅读。
- 暗色/亮色主题和移动端阅读交互。
- 浏览器章节缓存和离线提示。

## 后端

- axum HTTP API，接口统一位于 `/reader3`。
- SQLite 存储用户、书源、书架、阅读进度和 AI 资料。
- 文件缓存保存章节内容和上传资源。
- reqwest 抓取远程内容。
- rquickjs 支持书源 JavaScript 规则。

## 书源解析

- CSS Selector
- JSONPath
- XPath
- Regex
- JavaScript
- Legado 风格规则兼容
- 搜索、详情、目录、正文多阶段解析

## 书架和阅读

- 添加、删除、分组、排序书籍。
- 保存和恢复阅读进度。
- 打开书籍前同步服务端最新进度。
- 恢复上次阅读会话时优先使用服务端进度。
- 章节正文缓存和批量缓存。
- 书签、替换规则、简繁转换、阅读统计。

## 本地 TXT

本地 TXT 书籍会进入服务端书架，而不是只保存在某台设备的浏览器里。

- 上传 `.txt` 文件。
- 自动解析常见章节标题。
- 生成稳定的本地书籍 URL 和章节 URL。
- 支持服务端目录、正文读取和阅读进度保存。
- 删除书籍时清理导入文件。
- 本地 TXT 不显示远程章节缓存标签，避免和远程书源书籍混淆。

设计说明见 [本地 TXT 小说服务端书架导入设计](../superpowers/specs/2026-06-08-local-txt-books-design)。

## AI 资料

- 按已读章节整理剧情概览、世界观、角色、关系和地点。
- 支持 OpenAI 兼容模型配置。
- 支持后端代理模型请求。
- 保留 AI 地图生成结果，避免成功生成图片后被关系图 fallback 覆盖。
- V2 方向是把 AI 资料演进成按章节增量更新的结构化知识库。

更多说明见 [AI 资料](./ai-book) 和 [AI资料 V2 结构化知识库设计](../superpowers/specs/2026-06-11-ai-book-v2-design)。

## RSS 和备份

- RSS 源管理、文章列表和文章阅读。
- 服务端文件备份、下载、上传和删除。
- 书源导入导出。

## 文档站

- GitHub Pages: `https://maple0517.github.io/reader-next/`
- VitePress 文档位于 `docs/`
- Pages workflow 支持 push 自动部署和手动触发

## 测试

推荐在合并或发布前运行：

```bash
cargo test

cd frontend
npm run test
```
