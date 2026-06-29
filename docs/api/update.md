# 应用更新 API

## 获取版本更新信息

```
GET /reader3/getVersionUpdate
```

响应:
```json
{
  "success": true,
  "data": {
    "version": "v1.0.6",
    "hasUpdate": true,
    "releaseUrl": "https://github.com/...",
    "releaseNotes": "更新说明..."
  }
}
```

## 忽略版本更新

```
POST /reader3/dismissVersionUpdate
```

请求体:
```json
{
  "version": "v1.0.6"
}
```
