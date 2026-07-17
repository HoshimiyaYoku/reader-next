export function normalizeSourceLoginUrl(rawUrl: string, sourceUrl: string, pageUrl: string) {
  const target = rawUrl.trim()
  let url: URL

  try {
    url = new URL(target)
  } catch {
    let baseUrl = pageUrl
    try {
      const sourceBase = new URL(sourceUrl)
      if (sourceBase.protocol === 'http:' || sourceBase.protocol === 'https:') {
        baseUrl = sourceBase.href
      }
    } catch {
      // Some aggregate sources use a display name as bookSourceUrl.
    }
    url = new URL(target, baseUrl)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`书源请求打开不受支持的链接：${url.protocol}`)
  }
  return url.href
}
