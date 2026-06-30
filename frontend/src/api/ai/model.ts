import http from '../http'
import type { AiServerModelConfig, AiServerModelConfigResponse } from '../../types'

export function getAiModelConfig() {
  return http
    .get<AiServerModelConfigResponse>('/ai/model/config')
    .then((r) => r.data)
}

export function saveAiModelConfig(config: AiServerModelConfig) {
  return http
    .post<AiServerModelConfigResponse>('/ai/model/config', config)
    .then((r) => r.data)
}
