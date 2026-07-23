import { summarizeHttpErrorBody } from './httpError'
import { buildAuthHeaderValues } from './secureAccess'

export interface AzureSpeechRequest {
  region: string
  subscriptionKey: string
  input: string
  voice: string
  outputFormat: string
  rate?: number
  pitch?: number
  signal?: AbortSignal
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

async function readAzureSpeechError(response: Response) {
  const fallback = `Azure Speech 请求失败 (${response.status})`
  const contentType = response.headers.get('content-type') || ''
  try {
    if (contentType.includes('application/json')) {
      const data = await response.json() as {
        error?: { message?: string }
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

export async function requestAzureSpeechAudio(request: AzureSpeechRequest) {
  const response = await fetch('/reader3/tts/azure', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildReaderAuthHeaders(),
    },
    body: JSON.stringify({
      region: request.region,
      subscriptionKey: request.subscriptionKey,
      text: request.input,
      voice: request.voice,
      outputFormat: request.outputFormat,
      rate: request.rate,
      pitch: request.pitch,
    }),
    signal: request.signal,
  })
  if (!response.ok) {
    throw new Error(await readAzureSpeechError(response))
  }
  return response.blob()
}
