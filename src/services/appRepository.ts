import type { AppData } from '../types/domain'

export interface AppRepository {
  load(): AppData
  save(data: AppData): void
}
