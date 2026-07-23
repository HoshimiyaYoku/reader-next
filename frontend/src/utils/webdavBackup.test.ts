import { describe, expect, it } from 'vitest'
import {
  preserveLocalSpeechConfigSecrets,
  redactSpeechConfigSecrets,
} from './webdavBackup'

describe('WebDAV speech config secrets', () => {
  it('removes OpenAI and Azure keys from backups', () => {
    const captured = redactSpeechConfigSecrets(JSON.stringify({
      provider: 'azure',
      openaiApiKey: 'openai-secret',
      azureApiKey: 'azure-secret',
      azureRegion: 'eastasia',
    }))

    expect(JSON.parse(captured || '{}')).toEqual({
      provider: 'azure',
      azureRegion: 'eastasia',
    })
  })

  it('keeps this browser keys when restoring a redacted or legacy backup', () => {
    const restored = preserveLocalSpeechConfigSecrets(
      JSON.stringify({
        provider: 'openai',
        openaiApiKey: 'legacy-backup-secret',
        azureApiKey: 'legacy-azure-secret',
      }),
      JSON.stringify({
        openaiApiKey: 'local-openai-secret',
        azureApiKey: 'local-azure-secret',
      }),
    )

    expect(JSON.parse(restored)).toMatchObject({
      provider: 'openai',
      openaiApiKey: 'local-openai-secret',
      azureApiKey: 'local-azure-secret',
    })
    expect(restored).not.toContain('legacy-backup-secret')
    expect(restored).not.toContain('legacy-azure-secret')
  })

  it('does not restore legacy backup keys when the local config is invalid', () => {
    const restored = preserveLocalSpeechConfigSecrets(
      JSON.stringify({
        provider: 'azure',
        azureApiKey: 'legacy-azure-secret',
      }),
      '{invalid-json',
    )

    expect(JSON.parse(restored)).toEqual({ provider: 'azure' })
  })
})
