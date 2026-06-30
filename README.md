# Reader Next

Reader Next 是一个面向自用与二次开发的阅读 3.0 服务端：Rust 后端负责书源解析、账号、缓存和 AI 调用，Vue 前端负责书架、阅读器、本地书籍和阅读辅助。

主线从”能跑的阅读服务”推进到”长篇阅读辅助”：章节摘要侧栏、AI 资料、AI 追赶、模型 provider preset、本地书籍书架和跨设备进度都在同一套服务端数据里工作。

> **⚠️ Reader Next** — 基于 [reader-rust](https://github.com/givenge/reader-rust) 持续维护与修复，重点发展 AI 智能功能（章节摘要、AI 资料库、AI 追赶、关系图谱等）。API 和数据结构与上游不保证兼容，属于独立开发分支。

## 入口

- 文档站：https://maple0517.github.io/reader-next/
- GitHub：https://github.com/Maple0517/reader-next

## 现在有什么

- 自定义书源：搜索、详情、目录、正文解析。
- 多规则解析：CSS Selector、JSONPath、XPath、Regex、JavaScript。
- 服务端书架：书架、分组、最近阅读、阅读进度、章节缓存。
- 本地书籍：支持上传 TXT、EPUB、MOBI、PDF 格式，解析章节后加入服务端书架，跨设备阅读。
- AI 章节摘要：阅读页侧边摘要栏、要点列表、自动生成、详细程度控制、隐藏状态持久化。
- AI 资料：按已读章节整理剧情、世界观、角色、关系和地图资料。
- AI 追赶：后台批量处理已读章节，支持暂停/恢复，前端可关闭后继续处理。
- AI provider preset：文本模型可配置接口路径，兼容 OpenAI 风格网关、Responses、Claude/Gemini 兼容转发等常见入口。
- WebDAV 备份：支持备份/恢复书架、书源、阅读进度等数据。
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

## Docker 部署

镜像默认把 Rust 后端和已构建好的前端打在一起，容器内监听 `18080`，数据写入 `/app/storage`。

```bash
docker run -d \
  --name reader-next \
  --restart unless-stopped \
  -p 18080:18080 \
  -v reader-storage:/app/storage \
  ghcr.io/maple0517/reader-next:latest
```

打开：

```text
http://localhost:18080
```

推荐用 Compose 管理：

```bash
cp deploy/env.docker.example .env.docker
docker compose -f deploy/compose.yml up -d
```

升级：

```bash
docker compose -f deploy/compose.yml pull
docker compose -f deploy/compose.yml up -d
```

重要：SQLite 数据库、上传文件和缓存都在 `/app/storage`，必须挂载 volume 或宿主机目录，否则删容器会丢数据。

常用镜像标签：

- `ghcr.io/maple0517/reader-next:latest`：最新稳定版本。
- `ghcr.io/maple0517/reader-next:vX.Y.Z`：固定版本。
- `ghcr.io/maple0517/reader-next:X.Y.Z`：同一个固定版本，不带 `v`。
- `ghcr.io/maple0517/reader-next:X.Y`：同一 minor 的最新版本。

完整 Docker 部署和发布说明见 [docs/deploy/docker.md](docs/deploy/docker.md)。

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
| `SECURE_KEY` | 空 | 安全模式密钥，生产环境不要写进镜像 |
| `INVITE_CODE` | 空 | 注册邀请码 |
| `USER_LIMIT` | `50` | 最大用户数 |
| `USER_BOOK_LIMIT` | `2000` | 每用户最大书籍数 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `REQUEST_TIMEOUT_SECS` | `15` | HTTP 请求超时(秒) |

`storage/` 是本地运行数据，不提交到 Git。

## 项目结构

```text
src/api/       HTTP handlers 和 /reader3 路由
src/app/       应用启动、配置加载
src/crawler/   HTTP 客户端
src/model/     数据模型和 DTO
src/parser/    CSS / JSONPath / XPath / JS / Regex 规则解析
src/service/   书源、书架、AI、章节摘要、本地书籍等业务逻辑
src/storage/   SQLite、文件缓存和上传资源
src/util/      通用工具函数
frontend/      Vue 3 + Vite + Pinia 前端
docs/          VitePress 文档站
```

## 上游关系

本仓库独立维护，不是 GitHub fork。本地可保留原项目 `upstream` 作为参考，需要时再手动移植更新。

## 致谢

- 原始项目：`givenge/reader-rust`
- 上游项目：`hectorqin/reader`
