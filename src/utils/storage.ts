import type { StoredData } from '../types/data'

export const EMPTY_DATA: StoredData = {
  hotels: [],
  lastYear: [],
  sameLeadSnapshots: [],
  batches: [],
  renovations: [],
  currentBaseDate: '',
  mappings: {},
  channelMappings: {},
  settings: { countMissingBookingAsZero: true },
}

export function downloadJson(data: StoredData) {
  downloadBlob(JSON.stringify(data, null, 2), `华西预警数据备份_${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
}

export async function importBackup(file: File): Promise<StoredData> {
  const parsed = JSON.parse(await file.text())
  if (!Array.isArray(parsed.hotels) || !Array.isArray(parsed.lastYear) || !Array.isArray(parsed.batches)) throw new Error('备份文件结构不正确')
  return { ...EMPTY_DATA, ...parsed }
}

export function downloadBlob(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
