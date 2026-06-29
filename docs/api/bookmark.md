# 书签管理 API

## 获取书签列表

```
GET /reader3/getBookmarks
```

查询参数:
- `bookUrl` - 书籍URL (可选，不传则获取所有书签)

响应:
```json
{
  "success": true,
  "data": [
    {
      "bookUrl": "书籍URL",
      "chapterUrl": "章节URL",
      "chapterTitle": "章节标题",
      "bookProgress": 50.5,
      "content": "选中文本",
      "createTime": 1699999999999
    }
  ]
}
```

## 保存书签

```
POST /reader3/saveBookmark
```

请求体:
```json
{
  "bookUrl": "书籍URL",
  "chapterUrl": "章节URL",
  "chapterTitle": "章节标题",
  "bookProgress": 50.5,
  "content": "选中文本"
}
```

## 批量保存书签

```
POST /reader3/saveBookmarks
```

请求体: 书签数组

## 删除书签

```
POST /reader3/deleteBookmark
```

请求体:
```json
{
  "bookUrl": "书籍URL",
  "chapterUrl": "章节URL",
  "createTime": 1699999999999
}
```

## 批量删除书签

```
POST /reader3/deleteBookmarks
```

请求体: 书签数组
