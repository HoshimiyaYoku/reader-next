# Reader Next

Reader Next 是一个面向自用与二次开发的阅读 3.0 服务端：Rust 后端负责书源解析、账号、缓存和 AI 调用，Vue 前端负责书架、阅读器、本地 TXT 和阅读辅助。

最近主线已经从“能跑的阅读服务”推进到“长篇阅读辅助”：章节摘要侧栏、AI 资料、模型 provider preset、本地 TXT 书架和跨设备进度都在同一套服务端数据里工作。

## 入口

- 文档站：https://maple0517.github.io/reader-next/
- GitHub：https://github.com/Maple0517/reader-next

## 现在有什么

- 自定义书源：搜索、详情、目录、正文解析。
- 多规则解析：CSS Selector、JSONPath、XPath、Regex、JavaScript。
- 服务端书架：书架、分组、最近阅读、阅读进度、章节缓存。
- 本地 TXT：上传小说、解析章节、加入服务端书架、跨设备阅读。
- AI 章节摘要：阅读页侧边摘要栏、要点列表、自动生成、详细程度控制、隐藏状态持久化。
- AI 资料：按已读章节整理剧情、世界观、角色、关系和地图资料。
- AI provider preset：文本模型可配置接口路径，兼容 OpenAI 风格网关、Responses、Claude/Gemini 兼容转发等常见入口。
- RSS、TTS、缓存管理、用户和权限管理。

## 本地开发

默认用单端口模式：先构建前端，再由 Rust 服务端同时提供页面和 `/reader3/*` API。

```bash
cd frontend
npm install
npm run build

cd ..
SERVER_PORT=18080 cargo run
```

打开：

```text
http://localhost:18080
```

只有需要前端热更新时才单独运行 Vite：

```bash
cd frontend
npm run dev
```

Vite 默认监听 `5173`，并把 `/reader3` 代理到后端端口。

## 常用命令

```bash
# 后端
cargo run
cargo test
cargo build --release

# 前端
cd frontend
npm run build
npm run test

# 文档站
cd docs
npm run docs:dev
npm run docs:build
```

## 配置

配置从 `.env` 或环境变量读取，嵌套配置使用 `__` 分隔。完整示例见 `.env.example`。

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_HOST` | `0.0.0.0` | 服务监听地址 |
| `SERVER_PORT` | `18080` | 服务端口 |
| `DATABASE_URL` | `sqlite:storage/reader.db?mode=rwc` | SQLite 数据库 |
| `WEB_ROOT` | `frontend/dist` | 前端静态资源目录 |
| `SECURE` | `false` | 是否启用安全模式 |
| `LOG_LEVEL` | `info` | 日志级别 |

`storage/` 是本地运行数据，不提交到 Git。

## 项目结构

```text
src/api/       HTTP handlers 和 /reader3 路由
src/service/   书源、书架、AI、章节摘要等业务逻辑
src/parser/    CSS / JSONPath / XPath / JS / Regex 规则解析
src/storage/   SQLite、文件缓存和上传资源
frontend/      Vue 3 + Vite + Pinia 前端
docs/          VitePress 文档站
```

## 上游关系

本仓库独立维护，不是 GitHub fork。本地可保留原项目 `upstream` 作为参考，需要时再手动移植更新。

## 致谢

- 原始项目：`givenge/reader-rust`
- 上游项目：`hectorqin/reader`
