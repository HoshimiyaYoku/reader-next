# AI 资料 API

## 获取 AI 资料

```
GET /reader3/aiBook/memory
```

查询参数:
- `bookUrl` - 书籍URL

响应: 当前书籍的 AI 资料数据。

## 获取章节 AI 资料

```
GET /reader3/aiBook/chapterMemory
```

查询参数:
- `bookUrl` - 书籍URL
- `chapterUrl` - 章节URL

## 重置 AI 资料

```
POST /reader3/aiBook/memory/reset
```

请求体:
```json
{
  "bookUrl": "书籍URL"
}
```

## 设置 AI 资料启用状态

```
POST /reader3/aiBook/enabled
```

请求体:
```json
{
  "bookUrl": "书籍URL",
  "enabled": true
}
```

## 生成章节 AI 资料

```
POST /reader3/aiBook/chapterMemory/generate
```

请求体:
```json
{
  "bookUrl": "书籍URL",
  "chapterUrl": "章节URL"
}
```

## 生成地图

```
POST /reader3/aiBook/map/generate
```

请求体:
```json
{
  "bookUrl": "书籍URL"
}
```

## 启动 AI 追赶

```
POST /reader3/aiBook/catchup/start
```

请求体:
```json
{
  "bookUrl": "书籍URL",
  "startChapterIndex": 0,
  "targetChapterIndex": 100
}
```

## 获取 AI 追赶状态

```
GET /reader3/aiBook/catchup/status
```

查询参数:
- `bookUrl` - 书籍URL

响应:
```json
{
  "success": true,
  "data": {
    "status": "running|paused|completed|failed",
    "startChapterIndex": 0,
    "targetChapterIndex": 100,
    "currentChapterIndex": 50,
    "totalChapters": 100
  }
}
```

## 取消 AI 追赶

```
POST /reader3/aiBook/catchup/cancel
```

请求体:
```json
{
  "bookUrl": "书籍URL"
}
```

## 获取 AI 模型配置

```
GET /reader3/getAiModelConfig
```

响应: 后端模型配置信息和当前用户权限状态。

## 保存 AI 模型配置

```
POST /reader3/saveAiModelConfig
```

请求体: 模型配置对象（仅管理员）

## AI 代理请求

```
POST /reader3/aiProxy
```

请求体: 模型请求参数，后端转发到配置的模型服务。

## AI 图片代理

```
POST /reader3/aiProxyImage
```

请求体: 图片模型请求参数
