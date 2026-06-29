# 书籍搜索 API

## 搜索书籍

```
GET /reader3/searchBook
```

查询参数:
- `key` - 搜索关键词
- `page` - 页码，默认1
- `bookSourceUrl` - 指定书源(可选)

响应:
```json
{
  "success": true,
  "data": [
    {
      "name": "书名",
      "author": "作者",
      "coverUrl": "https://...",
      "bookUrl": "https://...",
      "intro": "简介",
      "kind": "玄幻",
      "wordCount": "100万字",
      "lastChapter": "最新章节",
      "sourceName": "书源名称"
    }
  ],
  "errorMsg": null
}
```

## 获取书籍详情

```
GET /reader3/getBookInfo
```

查询参数:
- `url` - 书籍URL

响应:
```json
{
  "success": true,
  "data": {
    "name": "书名",
    "author": "作者",
    "coverUrl": "https://...",
    "intro": "书籍简介",
    "kind": "分类",
    "wordCount": "字数",
    "lastChapter": "最新章节",
    "tocUrl": "目录页URL"
  },
  "errorMsg": null
}
```

## 搜索书籍 (多源)

```
GET /reader3/searchBookMulti
```

查询参数:
- `key` - 搜索关键词
- `page` - 页码，默认1

## 搜索书籍 (多源 SSE)

```
GET /reader3/searchBookMultiSSE
```

SSE 实时返回搜索结果。

## 搜索书源 (SSE)

```
GET /reader3/searchBookSourceSSE
```

查询参数:
- `url` - 书籍URL

SSE 实时返回可用书源。

## 探索书籍

```
GET /reader3/exploreBook
```

查询参数:
- `ruleFindUrl` - 发现规则URL
- `bookSourceUrl` - 书源URL (可选)
- `page` - 页码 (可选)

## 全局探索书籍

```
POST /reader3/exploreBookGlobal
```

请求体:
```json
{
  "keyword": "分类关键词",
  "page": 1
}
```

## 获取发现分类

```
POST /reader3/getExploreKinds
```

请求体:
```json
{
  "bookSourceUrl": "书源URL"
}
```

## 获取目录

```
GET /reader3/getChapterList
```

查询参数:
- `url` - 目录页URL或书籍URL

响应:
```json
{
  "success": true,
  "data": [
    {
      "title": "第一章 xxx",
      "url": "https://...",
      "index": 0
    }
  ],
  "errorMsg": null
}
```
