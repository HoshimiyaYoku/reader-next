# 近期变更

当前 `master` 历史已经整理成：

```text
initial import: reader-rust baseline
后续 Reader Next 改动
```

下面是 `initial import` 之后的主要变更。

## AI 地图结果保留

Commit: `fix: preserve generated AI map images`

- 修复 AI 地图生成成功后仍被降级展示为关系图的问题。
- 保留生成图片的路径和元数据。
- 让 AI 资料页面能稳定展示地图生成结果。

## 本地 TXT 服务端书架

Commits:

- `docs: design local txt book import`
- `feat: support local txt book uploads`
- `fix: prevent local txt adjacent chapter panic`
- `fix: hide cache labels for local txt books`
- `fix: harden local txt upload handling`

主要能力：

- 上传 `.txt` 小说并加入服务端书架。
- 自动解析章节，生成稳定的本地书籍 URL 和章节 URL。
- 章节正文通过后端读取，不依赖单台设备的浏览器存储。
- 阅读进度可以跟随服务端账号在设备间同步。
- 删除本地 TXT 书籍时清理导入文件。
- 本地 TXT 不展示远程缓存标签，避免 UI 误导。
- 增加后端和前端测试覆盖。

设计说明：[本地 TXT 小说服务端书架导入设计](../superpowers/specs/2026-06-08-local-txt-books-design)。

## AI 资料 V2 设计

Commit: `docs: design ai book v2 knowledge base`

目标是把 AI 资料从一次性生成结果，推进到随阅读进度增量演进的结构化知识库。

设计重点：

- 按章节范围更新。
- 分离摘要、角色、地点、关系、事件和世界观。
- 保留 `category`、`importance`、`parentId / parentName` 和地图 fallback 信息。
- 兼容旧 AI 资料数据。

设计说明：[AI资料 V2 结构化知识库设计](../superpowers/specs/2026-06-11-ai-book-v2-design)。

## 阅读进度同步

Commit: `fix: sync reading progress across devices`

- 打开书籍前从服务端读取最新书架书籍状态。
- 恢复上次阅读会话时优先使用服务端最新阅读进度。
- 避免多设备之间因为本地缓存会话较旧而读偏章节。
- 增加针对打开书籍和恢复会话的前端测试。

## GitHub Pages

Commit: `docs: configure reader-next pages`

- 文档站 base 改为 `/reader-next/`。
- GitHub 链接改为 `Maple0517/reader-next`。
- Pages workflow 支持 push 自动部署和手动触发。

访问地址：

```text
https://maple0517.github.io/reader-next/
```

## README

Commit: `docs: refresh reader-next readme`

- README 改为 Reader Next 项目入口。
- 更新文档站、开发命令、构建说明、测试说明和上游同步说明。
- 去掉旧仓库 Docker 镜像说明，避免误导。
