import { describe, expect, it } from 'vitest'
import { normalizeSourceLoginUrl } from './sourceLoginUrl'

describe('normalizeSourceLoginUrl', () => {
  it('opens an absolute registration URL even when bookSourceUrl is a display name', () => {
    expect(
      normalizeSourceLoginUrl(
        'https://v2.gyks.cf/register',
        '光遇聚合',
        'https://reader.example/source',
      ),
    ).toBe('https://v2.gyks.cf/register')
  })

  it('resolves a relative URL against a valid source URL', () => {
    expect(
      normalizeSourceLoginUrl('/register', 'https://v2.gyks.cf', 'https://reader.example/source'),
    ).toBe('https://v2.gyks.cf/register')
  })
})
