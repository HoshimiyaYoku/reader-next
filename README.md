# Reader Next

Reader Next 是一个独立维护的阅读 3.0 Rust 服务端项目，面向自定义书源、跨设备书架、章节缓存和 AI 辅助阅读场景。

项目由 Reader Next 代码基础继续演进，当前主线会优先服务自用体验和后续重构，不再依赖原仓库的 issue / PR 响应节奏。

## 文档

- 文档站：https://maple0517.github.io/reader-next/
- GitHub：https://github.com/Maple0517/reader-next

## 功能

- 自定义书源搜索、详情、目录、正文解析
- CSS Selector / JSONPath / XPath / Regex / JavaScript 多规则支持
- SQLite 数据存储和章节文件缓存
- 书架、最近阅读、阅读进度、缓存管理
- RSS 订阅
- TTS 朗读
- 本地 TXT 小说上传并加入服务端书架
- AI 资料、关系图、阅读辅助相关能力

## 本地开发

### 后端

```bash
cargo run
```

默认监听 `0.0.0.0:18080`，并直接服务 `frontend/dist`，本地默认打开 `http://localhost:18080`。

### 前端

```bash
cd frontend
npm install
npm run build
```

默认使用单端口模式。只有需要前端热更新时才运行 `npm run dev`，Vite 监听 `http://localhost:5173`，并把 `/reader3` 代理到 `SERVER_PORT`。

### 文档站

```bash
cd docs
npm install
npm run docs:dev
```

## 构建

### 前端静态资源

```bash
cd frontend
npm run build
```

构建产物位于 `frontend/dist/`。

### 后端 release

```bash
cargo build --release
```

Dockerfile 会复制宿主机已构建好的二进制和 `frontend/dist/`，不会在镜像内编译 Rust。

## 配置

配置从 `.env` 或环境变量读取，嵌套配置使用 `__` 分隔。完整示例见 `.env.example`。

常用项：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_HOST` | `0.0.0.0` | 服务监听地址 |
| `SERVER_PORT` | `18080` | 服务端口 |
| `DATABASE_URL` | `sqlite:storage/reader.db?mode=rwc` | SQLite 数据库 |
| `WEB_ROOT` | `frontend/dist` | 前端静态资源目录 |
| `SECURE` | `false` | 是否启用安全模式 |
| `LOG_LEVEL` | `info` | 日志级别 |

`storage/` 和本地运行数据不应提交到 Git。

## 测试

```bash
cargo test

cd frontend
npm run test
```

## 同步上游

本仓库不是 GitHub fork，但本地保留了原仓库 remote：

```bash
git fetch upstream
git switch upstream-master
git merge --ff-only upstream/master
```

从 `upstream-master` 挑选需要的更新，按需移植到 `main`。

## 致谢

- 原始项目：`givenge/reader-rust`
- 上游项目：`hectorqin/reader`
