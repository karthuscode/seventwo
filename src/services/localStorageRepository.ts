import type { AppRepository } from './appRepository'
import type { AppData } from '../types/domain'

const STORAGE_KEY = 'poker-session-manager-data-v1'

const EMPTY_DATA: AppData = {
  players: [],
  sessions: [],
  sessionPlayers: [],
  transactions: [],
}

export class LocalStorageRepository implements AppRepository {
  load(): AppData {
    const savedData = window.localStorage.getItem(STORAGE_KEY)
    if (!savedData) return EMPTY_DATA

    try {
      return JSON.parse(savedData) as AppData
    } catch {
      return EMPTY_DATA
    }
  }

  save(data: AppData): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }
}
