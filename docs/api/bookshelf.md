# 书架管理 API

## 获取书架

```
GET /reader3/getBookshelf
```

响应: 当前用户的书架书籍列表。

## 获取书架书籍

```
GET /reader3/getShelfBook
```

查询参数:
- `url` - 书籍URL

## 获取书架书籍(含缓存信息)

```
GET /reader3/getShelfBookWithCacheInfo
```

查询参数:
- `url` - 书籍URL

## 保存书籍到书架

```
POST /reader3/saveBook
```

请求体: 书籍对象

## 批量保存书籍

```
POST /reader3/saveBooks
```

请求体: 书籍数组

## 删除书架书籍

```
POST /reader3/deleteBook
```

请求体:
```json
{
  "url": "书籍URL"
}
```

## 批量删除书籍

```
POST /reader3/deleteBooks
```

请求体:
```json
{
  "urls": ["url1", "url2"]
}
```

## 设置书源

```
POST /reader3/setBookSource
```

请求体:
```json
{
  "bookUrl": "原书籍URL",
  "newUrl": "新书源URL",
  "bookSourceUrl": "书源URL"
}
```

## 保存阅读进度

```
POST /reader3/saveBookProgress
```

请求体:
```json
{
  "bookUrl": "书籍URL",
  "chapterUrl": "章节URL",
  "chapterTitle": "章节标题",
  "readProgress": 50.5
}
```

## 删除书籍缓存

```
POST /reader3/deleteBookCache
```

## 上传本地书籍

```
POST /reader3/uploadTxtBook     # TXT 格式
POST /reader3/uploadEpubBook    # EPUB 格式
POST /reader3/uploadMobiBook    # MOBI 格式
POST /reader3/uploadPdfBook     # PDF 格式
```

请求体: `multipart/form-data`，字段名 `file`

## 获取书架分组

```
GET /reader3/getBookGroups
```

## 保存书架分组

```
POST /reader3/saveBookGroup
```

## 删除书架分组

```
POST /reader3/deleteBookGroup
```

## 保存分组排序

```
POST /reader3/saveBookGroupOrder
```

## 保存书籍分组

```
POST /reader3/saveBookGroupId
```

## 批量添加分组

```
POST /reader3/addBookGroupMulti
```

## 批量移除分组

```
POST /reader3/removeBookGroupMulti
```

## 获取可用书源

```
GET /reader3/getAvailableBookSource
```

查询参数:
- `url` - 书籍URL

## 获取可用书源 (SSE)

```
GET /reader3/getAvailableBookSourceSSE
```
