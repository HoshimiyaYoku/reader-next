# WebDAV 备份 API

## 获取 WebDAV 文件列表

```
GET /reader3/getWebdavFileList
```

## 获取 WebDAV 文件

```
GET /reader3/getWebdavFile
```

查询参数:
- `fileName` - 文件名

## 上传文件到 WebDAV

```
POST /reader3/uploadFileToWebdav
```

请求体: `multipart/form-data`

## 删除 WebDAV 文件

```
POST /reader3/deleteWebdavFile
```

请求体:
```json
{
  "fileName": "文件名"
}
```

## 批量删除 WebDAV 文件

```
POST /reader3/deleteWebdavFileList
```

请求体:
```json
{
  "fileNames": ["file1", "file2"]
}
```

## WebDAV 代理

```
ANY /reader3/webdav/*path
```

WebDAV 协议代理接口。
