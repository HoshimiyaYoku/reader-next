# Reader Next

Reader Next 是一个面向自用与二次开发的阅读 3.0 服务端：Rust 后端负责书源解析、账号、缓存和 AI 调用，Vue 前端负责书架、阅读器、本地书籍和阅读辅助。

> [!IMPORTANT]
> 本仓库是基于 [Maple0517/reader-next](https://github.com/Maple0517/reader-next) 继续维护的个人增强 fork，不是从零重写，也不代表上游项目。
>
> 项目的主体架构、基础功能和大量实现来自上游及更早的开源贡献者。本仓库只是在这些成果之上，根据维护者自己的使用需求补充功能、修复问题并发布可用镜像。

部分增强功能由维护者提出明确需求，并借助 AI 编程工具协助分析、实现和测试。AI 工具不是项目成果的原始来源；所有上游代码与历史贡献仍归其原作者和贡献者。本仓库发布前的功能取舍、测试和维护由当前维护者负责。

## 项目关系与致谢

本项目的演进关系如下：

1. [hectorqin/reader](https://github.com/hectorqin/reader) 提供了重要的阅读服务能力与项目基础。
2. [givenge/reader-rust](https://github.com/givenge/reader-rust) 进行了 Rust 服务端方向的探索与实现。
3. [Maple0517/reader-next](https://github.com/Maple0517/reader-next) 在此基础上持续维护，并发展了当前 Reader Next 的主体架构和大量功能。
4. 本仓库 [HoshimiyaYoku/reader-next](https://github.com/HoshimiyaYoku/reader-next) 基于上述成果，继续加入个人需要的增强和兼容性修复。

感谢所有原作者、维护者、贡献者、问题反馈者和书源作者。没有这些上游工作，就没有本仓库。

本仓库无意改变任何上游成果的归属。复制、修改或分发代码时，请同时尊重来源项目的许可证、版权声明和贡献历史；从上游同步代码时也应保留原有署名。

## 仓库定位

这个 fork 主要服务于维护者自己的实际阅读需求，同时公开发布，方便有相同需求的人使用和反馈。

- 保持 Reader Next 的核心使用方式，不把项目包装成全新的原创产品。
- 优先修复真实使用中遇到的书源、移动端、本地书籍和部署问题。
- 对上游 API、数据结构和发布节奏不作兼容承诺。
- 新功能先在本 fork 中验证；适合上游的通用修复，后续再整理成范围清晰的小型 PR。
- 本项目为个人维护分支，并非上述上游仓库的官方版本。

## 当前能力

以下能力主要继承自 Reader Next 及其上游，并在本仓库中继续维护：

- 自定义书源：搜索、详情、目录和正文解析。
- 多规则解析：CSS Selector、JSONPath、XPath、Regex 和 JavaScript。
- 服务端书架：书架、分组、最近阅读、阅读进度和章节缓存。
- 本地书籍：TXT、EPUB、MOBI、PDF 上传、章节解析和跨设备阅读。
- AI 章节摘要：阅读页摘要、要点列表、自动生成和详细程度控制。
- AI 资料与追赶：整理剧情、世界观、角色、关系和地图资料，后台处理已读章节。
- AI provider preset：兼容常见 OpenAI、Responses、Claude 和 Gemini 风格入口。
- WebDAV 备份与恢复。
- RSS、TTS、缓存管理、用户和权限管理。

## 本 fork 的近期增强

相对于 fork 时的上游版本，本仓库近期主要增加或改进了：

- 改善 iOS 添加到主屏幕后启动时的安全区域与底部空白问题。
- 增加“搜索更多”能力，允许继续扩大搜索范围和深度。
- 加强聚合书源兼容性，保存书籍与章节变量，兼容 `java.get/put` 和 `book/chapter.putVariable`。
- 修复聚合书源试读正常、加入书架后因上下文丢失而无法阅读的问题。
- 本地书籍支持重命名、搜索封面和上传自定义封面。
- 手机阅读控制栏显示当前章节名称、章节序号和总章节数。
- 手机目录提供明确的刷新入口，并使用书籍真实 `tocUrl` 刷新。

完整变化以 [Releases](https://github.com/HoshimiyaYoku/reader-next/releases) 和 Git 提交记录为准。

## 使用入口

- 当前仓库：https://github.com/HoshimiyaYoku/reader-next
- 版本发布：https://github.com/HoshimiyaYoku/reader-next/releases
- Docker 镜像：`ghcr.io/hoshimiyayoku/reader-next`
- 上游文档站：https://maple0517.github.io/reader-next/

上游文档可以帮助理解 Reader Next 的基本使用方式，但本 fork 的新增功能和实际行为请以当前仓库为准。

## Docker 部署

镜像包含 Rust 后端和已构建的 Vue 前端，容器内默认监听 `18080`，数据写入 `/app/storage`。

```bash
docker run -d \
  --name reader-next \
  --restart unless-stopped \
  -p 18080:18080 \
  -v reader-storage:/app/storage \
  ghcr.io/hoshimiyayoku/reader-next:latest
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

如果需要把仓库里的 `storage/reader.db` 挂给 Docker，同时把本地开发隔离到另一份数据库，可以使用：

```bash
docker compose -f deploy/compose.local.yml up -d
```

该配置默认把 `./storage` 挂载到容器的 `/app/storage`，并监听 `28080`。本地开发可以使用独立数据库：

```bash
cp .env.dev.example .env.dev
./scripts/run-dev.sh
```

升级镜像：

```bash
docker compose -f deploy/compose.yml pull
docker compose -f deploy/compose.yml up -d
```

> [!WARNING]
> SQLite 数据库、上传文件和缓存都在 `/app/storage`。必须挂载 volume 或宿主机目录，否则删除容器会丢失数据。

常用镜像标签：

- `ghcr.io/hoshimiyayoku/reader-next:latest`：最新稳定版本。
- `ghcr.io/hoshimiyayoku/reader-next:vX.Y.Z`：固定版本。
- `ghcr.io/hoshimiyayoku/reader-next:X.Y.Z`：同一固定版本，不带 `v`。
- `ghcr.io/hoshimiyayoku/reader-next:X.Y`：同一 minor 系列的最新版本。

完整 Docker 部署说明见 [docs/deploy/docker.md](docs/deploy/docker.md)。

## 本地开发

默认使用单端口模式：先构建前端，再由 Rust 服务端同时提供页面和 `/reader3/*` API。

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

配置从 `.env` 或环境变量读取，嵌套配置使用 `__` 分隔。完整示例见 [.env.example](.env.example)。

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
| `REQUEST_TIMEOUT_SECS` | `15` | HTTP 请求超时（秒） |

`storage/` 是本地运行数据，不应提交到 Git。

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

## 如何回馈上游

不熟悉 PR（Pull Request）没有关系，也不需要一次把这个 fork 的所有功能提交给上游。更适合的方式是：

1. 先在当前 fork 中稳定使用和收集反馈。
2. 选择一个独立、通用且容易验证的修复。
3. 在上游仓库先搜索相同 Issue，必要时说明问题和复现方法。
4. 只提交与该问题有关的代码、测试和说明。
5. 尊重上游维护者的设计选择；即使 PR 没有合并，也不影响继续维护本 fork。

聚合书源兼容、iOS PWA 安全区域等通用修复，适合将来分别整理成小型 PR；明显属于个人产品方向的功能，则可以继续保留在本仓库。

## 问题反馈

提交 Issue 时，建议说明：

- 使用的版本号和部署方式。
- 手机或浏览器型号。
- 可以复现问题的操作步骤。
- 相关日志或截图。
- 涉及书源时，请先移除账号、Cookie、Token 等敏感信息。

书源失效也可能来自目标网站变化、登录限制或规则本身，并不一定是 Reader Next 的程序问题。
