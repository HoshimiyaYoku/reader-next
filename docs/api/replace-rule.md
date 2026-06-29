# 内容过滤规则 API

## 获取替换规则

```
GET /reader3/getReplaceRules
```

## 保存替换规则

```
POST /reader3/saveReplaceRule
```

请求体:
```json
{
  "name": "规则名称",
  "pattern": "匹配模式",
  "replacement": "替换文本",
  "isRegex": true,
  "enabled": true
}
```

## 批量保存替换规则

```
POST /reader3/saveReplaceRules
```

请求体: 规则数组

## 删除替换规则

```
POST /reader3/deleteReplaceRule
```

请求体:
```json
{
  "name": "规则名称"
}
```

## 批量删除替换规则

```
POST /reader3/deleteReplaceRules
```

请求体:
```json
{
  "names": ["rule1", "rule2"]
}
```
