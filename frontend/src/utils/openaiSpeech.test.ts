import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildOpenAISpeechUrl,
  requestOpenAISpeechAudio,
  shouldRequestSpeechDirectly,
} from './openaiSpeech'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('openaiSpeech', () => {
  it('accepts either a base URL or a complete HTTPS speech endpoint', () => {
    expect(buildOpenAISpeechUrl('https://tts.example.com')).toBe('https://tts.example.com/v1/audio/speech')
    expect(buildOpenAISpeechUrl('https://tts.example.com/v1')).toBe('https://tts.example.com/v1/audio/speech')
    expect(buildOpenAISpeechUrl('https://tts.example.com/v1/audio/speech')).toBe('https://tts.example.com/v1/audio/speech')
    expect(buildOpenAISpeechUrl('https://tts.example.com/v1/audio/speech?api-version=1')).toBe('https://tts.example.com/v1/audio/speech?api-version=1')
  })

  it('keeps HTTP and local-network TTS on the browser device', () => {
    expect(shouldRequestSpeechDirectly('http://localhost:8825/v1/audio/speech')).toBe(true)
    expect(shouldRequestSpeechDirectly('http://tts.example.com/v1/audio/speech')).toBe(true)
    expect(shouldRequestSpeechDirectly('https://192.168.1.20/v1/audio/speech')).toBe(true)
    expect(shouldRequestSpeechDirectly('https://tts-box.local/v1/audio/speech')).toBe(true)
    expect(shouldRequestSpeechDirectly('https://tts.example.com/v1/audio/speech')).toBe(false)
  })

  it('routes server configured speech through aiProxy without browser credentials', async () => {
    installLocalStorage()
    localStorage.setItem('accessToken', 'alice-token')
    localStorage.setItem('secureKey', 'reader-secure-key')
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
      headers: new Headers(),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const blob = await requestOpenAISpeechAudio({
      source: 'server',
      baseUrl: '',
      apiKey: 'browser-key',
      input: '你好',
      model: 'browser-model',
      voice: 'browser-voice',
      format: 'mp3',
      speed: 1,
    })

    expect(blob.type).toBe('audio/mpeg')
    expect(fetchMock).toHaveBeenCalledWith(
    '/reader3/ai/proxy',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'alice-token',
          'Content-Type': 'application/json',
          'X-Secure-Key': 'reader-secure-key',
        }),
      }),
    )
    const init = fetchMock.mock.calls[0]?.[1] as unknown as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      useServerConfig: true,
      kind: 'speech',
      path: '/v1/audio/speech',
      body: {
        input: '你好',
        response_format: 'mp3',
        speed: 1,
      },
    })
    expect(String(init.body)).not.toContain('browser-key')
  })

  it('routes a custom HTTPS endpoint through the reader proxy', async () => {
    installLocalStorage()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
      headers: new Headers(),
    })
    vi.stubGlobal('fetch', fetchMock)

    await requestOpenAISpeechAudio({
      source: 'browser',
      baseUrl: 'https://tts.example.com/v1/audio/speech',
      apiKey: 'browser-key',
      input: '你好',
      model: 'tts-model',
      voice: 'voice-id',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/reader3/ai/proxy',
      expect.objectContaining({ method: 'POST' }),
    )
    const proxyInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(proxyInit.body))).toMatchObject({
      baseUrl: 'https://tts.example.com/v1/audio/speech',
      apiKey: 'browser-key',
      fullUrl: true,
      kind: 'speech',
    })
  })

  it('requests localhost TTS directly from the browser device', async () => {
    installLocalStorage()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
      headers: new Headers(),
    })
    vi.stubGlobal('fetch', fetchMock)

    await requestOpenAISpeechAudio({
      source: 'browser',
      baseUrl: 'http://localhost:8825',
      apiKey: 'local-key',
      input: '本机朗读',
      model: 'tts-model',
      voice: 'voice-id',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8825/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer local-key' }),
      }),
    )
  })

  it('surfaces reader proxy JSON errors', async () => {
    installLocalStorage()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ isSuccess: false, errorMsg: 'TTS Key 无效' }),
    }))

    await expect(requestOpenAISpeechAudio({
      source: 'browser',
      baseUrl: 'https://tts.example.com/v1',
      input: '你好',
      model: 'tts-model',
      voice: 'voice-id',
    })).rejects.toThrow('TTS Key 无效')
  })
})

function installLocalStorage() {
  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
      clear: () => memory.clear(),
    },
    configurable: true,
  })
}
