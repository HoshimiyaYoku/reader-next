import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestAzureSpeechAudio } from './azureSpeech'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('azureSpeech', () => {
  it('sends Azure credentials through the authenticated reader proxy endpoint', async () => {
    installLocalStorage()
    localStorage.setItem('accessToken', 'alice-token')
    localStorage.setItem('secureKey', 'reader-secure-key')
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await requestAzureSpeechAudio({
      region: 'eastasia',
      subscriptionKey: 'azure-key',
      input: '你好',
      voice: 'zh-CN-XiaoxiaoNeural',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      rate: 1.2,
      pitch: 1,
    })

    expect(fetchMock).toHaveBeenCalledWith('/reader3/tts/azure', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'alice-token',
        'X-Secure-Key': 'reader-secure-key',
      }),
    }))
    const init = fetchMock.mock.calls[0]?.[1] as unknown as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      region: 'eastasia',
      subscriptionKey: 'azure-key',
      voice: 'zh-CN-XiaoxiaoNeural',
    })
  })

  it('surfaces Azure and reader proxy JSON errors', async () => {
    installLocalStorage()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ isSuccess: false, errorMsg: 'Azure Speech 订阅密钥无效' }),
    }))

    await expect(requestAzureSpeechAudio({
      region: 'eastasia',
      subscriptionKey: 'invalid-key',
      input: '你好',
      voice: 'zh-CN-XiaoxiaoNeural',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    })).rejects.toThrow('Azure Speech 订阅密钥无效')
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
