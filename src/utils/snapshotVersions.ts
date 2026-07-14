import type { PreviousFinalSnapshot, SnapshotBatch, SnapshotRecord, StoredData } from '../types/data'

const dayMs = 86400000
const batchNumber = (value: string) => {
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}
export const compareBatch = (a: string, b: string) => {
  const numeric = batchNumber(a) - batchNumber(b)
  return numeric || String(a).localeCompare(String(b), 'zh-CN')
}
export const inferBaseDate = (rows: SnapshotRecord[]) => rows.map(r => r.targetDate).filter(Boolean).sort()[0] || ''
export const inferStoredBaseDate = (data: Pick<StoredData, 'currentBaseDate' | 'batches'>) =>
  data.currentBaseDate || inferBaseDate(data.batches.flatMap(b => b.rows))

export function normalizeSnapshotWindow(records: SnapshotRecord[]) {
  const baseDate = inferBaseDate(records)
  if (!baseDate) throw new Error('上传文件中没有可识别的年月日')
  const base = new Date(`${baseDate}T00:00:00Z`).getTime()
  return {
    baseDate,
    records: records.map(r => ({
      ...r,
      snapshotDate: baseDate,
      dayOffset: `D${Math.round((new Date(`${r.targetDate}T00:00:00Z`).getTime() - base) / dayMs)}`,
    })),
  }
}

export function createCurrentBatches(records: SnapshotRecord[], baseDate: string, fileName: string, uploadTime = new Date().toISOString()): SnapshotBatch[] {
  const grouped = records.reduce<Record<string, SnapshotRecord[]>>((acc, row) => {
    (acc[row.batchTime] ||= []).push(row)
    return acc
  }, {})
  return Object.entries(grouped).map(([batchTime, rows]) => ({
    id: `${baseDate}_${batchTime}`,
    uploadTime,
    snapshotDate: baseDate,
    batchTime,
    fileName,
    rows,
  })).sort((a, b) => compareBatch(a.batchTime, b.batchTime))
}

export function createLatestCurrentBatch(records: SnapshotRecord[], baseDate: string, fileName: string, uploadTime = new Date().toISOString()): SnapshotBatch[] {
  const batches = createCurrentBatches(records, baseDate, fileName, uploadTime)
  const latest = batches.at(-1)
  return latest ? [latest] : []
}

export function capturePreviousFinal(batches: SnapshotBatch[], baseDate: string, sourceFileName = ''): PreviousFinalSnapshot | undefined {
  const allRows = batches.flatMap(batch => batch.rows)
  if (!allRows.length) return undefined
  const maxBatchByDate = new Map<string, string>()
  allRows.forEach(row => {
    const prior = maxBatchByDate.get(row.targetDate)
    if (!prior || compareBatch(row.batchTime, prior) > 0) maxBatchByDate.set(row.targetDate, row.batchTime)
  })
  const rows = allRows.filter(row => row.batchTime === maxBatchByDate.get(row.targetDate))
  return { baseDate, savedAt: new Date().toISOString(), sourceFileName: sourceFileName || batches.at(-1)?.fileName || '', rows }
}

export function applySnapshotUpload(data: StoredData, incoming: SnapshotRecord[], fileName: string, uploadTime = new Date().toISOString()): StoredData {
  const normalized = normalizeSnapshotWindow(incoming)
  const oldBaseDate = inferStoredBaseDate(data)
  const previousFinalSnapshot = data.batches.length && oldBaseDate
    ? capturePreviousFinal(data.batches, oldBaseDate, data.batches.at(-1)?.fileName || '')
    : data.previousFinalSnapshot
  return {
    ...data,
    currentBaseDate: normalized.baseDate,
    previousFinalSnapshot,
    batches: createLatestCurrentBatch(normalized.records, normalized.baseDate, fileName, uploadTime),
  }
}

export function previousFinalAsBatch(snapshot?: PreviousFinalSnapshot): SnapshotBatch | undefined {
  if (!snapshot?.rows.length) return undefined
  return {
    id: `previous_final_${snapshot.baseDate}`,
    uploadTime: snapshot.savedAt,
    snapshotDate: snapshot.baseDate,
    batchTime: '上一版',
    fileName: snapshot.sourceFileName,
    rows: snapshot.rows,
  }
}

export function mergePreviousByTargetDate(primary?: SnapshotBatch, fallback?: SnapshotBatch): SnapshotBatch | undefined {
  if (!primary) return fallback
  if (!fallback) return primary
  const primaryKeys = new Set(primary.rows.map(r => `${r.whCode}|${r.targetDate}`))
  return { ...primary, rows: [...primary.rows, ...fallback.rows.filter(r => !primaryKeys.has(`${r.whCode}|${r.targetDate}`))] }
}
