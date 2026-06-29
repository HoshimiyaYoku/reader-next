# 用户管理 API

## 用户注册

```
POST /reader3/register
```

请求体:
```json
{
  "username": "用户名",
  "password": "密码"
}
```

## 用户登录

```
POST /reader3/login
```

请求体:
```json
{
  "username": "用户名",
  "password": "密码"
}
```

响应:
```json
{
  "success": true,
  "data": {
    "token": "jwt-token-string",
    "username": "用户名"
  },
  "errorMsg": null
}
```

## 获取用户信息

```
GET /reader3/getUserInfo
```

Header:
```
Authorization: Bearer <token>
```

## 修改密码

```
POST /reader3/changePassword
```

请求体:
```json
{
  "oldPassword": "旧密码",
  "newPassword": "新密码"
}
```

## 获取用户配置

```
GET /reader3/getUserConfig
```

响应:
```json
{
  "success": true,
  "data": {
    "theme": "light",
    "fontSize": 16,
    "lineHeight": 1.5,
    "readConfig": { ... }
  },
  "errorMsg": null
}
```

## 保存用户配置

```
POST /reader3/saveUserConfig
```

请求体:
```json
{
  "theme": "dark",
  "fontSize": 18,
  "lineHeight": 1.8
}
```

## 用户登出

```
POST /reader3/logout
```

## 获取用户列表

```
GET /reader3/getUserList
```

仅管理员可用。

## 添加用户

```
POST /reader3/addUser
```

请求体:
```json
{
  "username": "用户名",
  "password": "密码"
}
```

仅管理员可用。

## 删除用户

```
POST /reader3/deleteUsers
```

请求体:
```json
{
  "usernames": ["user1", "user2"]
}
```

仅管理员可用。

## 重置密码

```
POST /reader3/resetPassword
```

请求体:
```json
{
  "username": "用户名",
  "newPassword": "新密码"
}
```

仅管理员可用。

## 更新用户

```
POST /reader3/updateUser
```

请求体:
```json
{
  "username": "用户名",
  "permissions": ["permission1", "permission2"]
}
```

仅管理员可用。

## 上传文件

```
POST /reader3/uploadFile
```

请求体: `multipart/form-data`

## 删除文件

```
POST /reader3/deleteFile
```

请求体:
```json
{
  "fileName": "文件名"
}
```

## 获取 TXT 目录规则

```
GET /reader3/getTxtTocRules
```
