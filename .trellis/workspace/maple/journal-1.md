# Journal - maple (Part 1)

> AI development session journal
> Started: 2026-06-26

---



## Session 1: 优化人物关系面板：分组胶囊+popover

**Date**: 2026-06-27
**Task**: 优化人物关系面板：分组胶囊+popover
**Branch**: `main`

### Summary

扩展角色上限5→15，图谱/列表解耦（图谱top5，列表全量）。分组按tone（家族/盟友/冲突等）胶囊流式布局，点击弹出popover详情。图谱节点简化为纯名字，UI整体打磨。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3bbbe52c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: Local EPUB/PDF upload support

**Date**: 2026-06-29
**Task**: Local EPUB/PDF upload support
**Branch**: `main`

### Summary

Implemented local EPUB/PDF upload support, fixed PDF text extraction, repaired frontend tests, verified cargo test, frontend tests, and build, then pushed main.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `24a31017` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Support local MOBI uploads

**Date**: 2026-06-29
**Task**: Support local MOBI uploads
**Branch**: `main`

### Summary

Added no-DRM MOBI local upload/read/delete support with backend service, API wiring, frontend upload support, tests, and verification.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4850f432` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: AI 面板重命名 + tab 持久化修复

**Date**: 2026-06-30
**Task**: AI 面板重命名 + tab 持久化修复
**Branch**: `main`

### Summary

修复 AI 面板刷新后 tab 重置的 bug（chapterSummaryActiveTab 未持久化到 ReadConfig），并将"AI 摘要"重构为"AI 面板"。第一个 tab 从"正文"改名为"摘要"。

### Main Changes

- stores/reader.ts: ReadConfig 新增 `chapterSummaryActiveTab` 字段及默认值
- ReaderView.vue: tab 初始化从 config 读取，watcher 中同步持久化
- ReaderView.vue: 3 处 kicker `摘要` → `AI 面板`，3 处 tab `正文` → `摘要`，3 处 aria-label 更新，toast 文案更新
- ReaderToolbar.vue: 按钮 title `显示/隐藏摘要` → `显示/隐藏 AI 面板`

### Git Commits

| Hash | Message |
|------|---------|
| (pending) | (not yet committed) |

### Testing

- [OK] `npm run build` 通过，服务启动正常

### Status

[OK] **Completed**

### Next Steps

- None - task complete
