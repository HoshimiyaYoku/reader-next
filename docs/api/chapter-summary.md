# 章节摘要 API

## 获取章节摘要

```
GET /reader3/chapterSummary
```

查询参数:
- `bookUrl` - 书籍URL
- `chapterUrl` - 章节URL

响应:
```json
{
  "success": true,
  "data": {
    "summary": "本章摘要...",
    "points": ["要点1", "要点2"],
    "generatedAt": 1699999999999
  }
}
```

## 生成章节摘要

```
POST /reader3/chapterSummary/generate
```

请求体:
```json
{
  "bookUrl": "书籍URL",
  "chapterUrl": "章节URL"
}
```

## 获取摘要配置

```
GET /reader3/chapterSummary/config
```

响应: 当前用户的章节摘要配置。

## 保存摘要配置

```
POST /reader3/chapterSummary/config
```

请求体:
```json
{
  "enabled": true,
  "autoGenerate": true,
  "detailLevel": "normal",
  "maxWords": 500
}
```
