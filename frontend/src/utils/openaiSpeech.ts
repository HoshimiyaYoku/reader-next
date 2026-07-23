import { summarizeHttpErrorBody } from './httpError'
import { buildAuthHeaderValues } from './secureAccess'

export const DEFAULT_OPENAI_BASE_URL = 'http://localhost:8825'

export function normalizeOpenAIBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '')
}

export function buildOpenAISpeechUrl(baseUrl: string) {
  const trimmed = baseUrl.trim()
  const queryIndex = trimmed.indexOf('?')
  const pathname = normalizeOpenAIBaseUrl(queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed)
  const query = queryIndex >= 0 ? trimmed.slice(queryIndex) : ''

  if (/\/audio\/speech$/i.test(pathname)) {
    return `${pathname}${query}`
  }
  if (/\/v1$/i.test(pathname)) {
    return `${pathname}/audio/speech${query}`
  }
  return `${pathname}/v1/audio/speech${query}`
}

export function shouldRequestSpeechDirectly(targetUrl: string) {
  try {
    const url = new URL(targetUrl)
    if (url.protocol === 'http:') return true
    if (url.protocol !== 'https:') return false
    return isLocalNetworkHostname(url.hostname)
  } catch {
    return false
  }
}

function isLocalNetworkHostname(rawHostname: string) {
  const hostname = rawHostname.replace(/^\[|\]$/g, '').toLowerCase()
  const isLocalIpv6 = hostname.includes(':') && (
    hostname === '::1'
    || hostname.startsWith('fc')
    || hostname.startsWith('fd')
    || /^fe[89ab]/.test(hostname)
  )
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || isLocalIpv6
  ) {
    return true
  }

  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
}

export interface OpenAISpeechRequest {
  source?: 'browser' | 'server'
  baseUrl: string
  apiKey?: string
  input: string
  model: string
  voice: string
  format?: string
  speed?: number
  signal?: AbortSignal
}

function buildApiKeyHeaders(apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

async function readSpeechError(response: Response) {
  const fallback = `语音请求失败 (${response.status})`
  const contentType = response.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const data = await response.json() as {
        error?: {
          message?: string
        }
        errorMsg?: string
        message?: string
      }
      return data.error?.message || data.errorMsg || data.message || fallback
    }

    const text = (await response.text()).trim()
    return summarizeHttpErrorBody(text, { fallback, status: response.status })
  } catch {
    return fallback
  }
}

export async function requestOpenAISpeechAudio({
  source = 'browser',
  baseUrl,
  apiKey,
  input,
  model,
  voice,
  format,
  speed,
  signal,
}: OpenAISpeechRequest) {
  const body = {
    model,
    input,
    voice,
    response_format: format || 'mp3',
    speed,
  }
  const useServerConfig = source === 'server'
  const targetUrl = useServerConfig ? '' : buildOpenAISpeechUrl(baseUrl)
  // Preserve browser-local HTTP/LAN TTS services (localhost must refer to the
  // reader's device), while public HTTPS services use the same-origin proxy to
  // avoid CORS without issuing a duplicate synthesis request.
  const response = !useServerConfig && shouldRequestSpeechDirectly(targetUrl)
    ? await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildApiKeyHeaders(apiKey),
      },
      body: JSON.stringify(body),
      signal,
    })
    : await fetch('/reader3/ai/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildReaderAuthHeaders(),
      },
      body: JSON.stringify({
        useServerConfig,
        kind: 'speech',
        baseUrl: useServerConfig ? undefined : targetUrl,
        fullUrl: !useServerConfig,
        path: useServerConfig ? '/v1/audio/speech' : '',
        apiKey: useServerConfig ? undefined : apiKey,
        body,
      }),
      signal,
    })

  if (!response.ok) {
    throw new Error(await readSpeechError(response))
  }

  return response.blob()
}

function buildReaderAuthHeaders() {
  const headers: Record<string, string> = {}
  try {
    const { accessToken, secureKey } = buildAuthHeaderValues(localStorage)
    if (accessToken) headers.Authorization = accessToken
    if (secureKey) headers['X-Secure-Key'] = secureKey
  } catch {
    // ignore storage access failures
  }
  return headers
}
