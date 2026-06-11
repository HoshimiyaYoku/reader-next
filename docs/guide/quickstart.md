# 快速开始

## 环境要求

- Rust stable
- Node.js 20+
- npm

## 克隆项目

```bash
git clone https://github.com/Maple0517/reader-next.git
cd reader-next
```

## 启动后端

```bash
cargo run
```

默认监听：

```text
0.0.0.0:8080
```

后端 API 前缀为 `/reader3`。

## 启动前端

另开一个终端：

```bash
cd frontend
npm install
npm run dev
```

Vite 默认地址：

```text
http://localhost:5173
```

开发环境会把 `/reader3` 代理到本地后端。

## 构建前端

```bash
cd frontend
npm run build
```

构建产物位于 `frontend/dist/`。后端生产运行时默认从这里提供静态文件。

## 运行测试

```bash
cargo test

cd frontend
npm run test
```

## 配置

配置从 `.env` 或环境变量读取。复制 `.env.example` 后按需修改：

```bash
cp .env.example .env
```

常用配置：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_HOST` | `0.0.0.0` | 服务绑定地址 |
| `SERVER_PORT` | `8080` | 服务端口 |
| `DATABASE_URL` | `sqlite:storage/reader.db?mode=rwc` | SQLite 数据库 |
| `WEB_ROOT` | `frontend/dist` | 前端静态资源目录 |
| `LOG_LEVEL` | `info` | 日志级别 |

更多配置见 [配置指南](./configuration)。

## GitHub Pages 文档

文档站由 GitHub Actions 发布：

```text
https://maple0517.github.io/reader-next/
```

本地预览文档：

```bash
cd docs
npm install
npm run docs:dev
```
