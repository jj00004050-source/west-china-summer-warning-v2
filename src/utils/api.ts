import type {
  BroadcastConfig,
  BroadcastPackage,
  BroadcastScope,
  BroadcastState,
  SnapshotBatch,
  SnapshotRecord,
  StoredData,
} from '../types/data'
import { EMPTY_DATA } from './storage'
import {
  createVersionInfo,
  hydrateRemoteData,
  type RemoteBatchManifest,
  type RemoteDashboardManifest,
  type RemoteDataEnvelope,
} from './remoteData'
import { channelGroup } from './channels'
import { buildComparisonRows, buildMetricRows } from './metrics'
import { buildStoreInsights } from './storeInsights'
import { mergePreviousByTargetDate, previousFinalAsBatch } from './snapshotVersions'

const configuredBase = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
const API_BASE = configuredBase || (import.meta.env.DEV && location.port === '5173' ? 'http://localhost:8787' : '')
const USE_VERSIONED_REMOTE = import.meta.env.PROD || import.meta.env.VITE_REMOTE_DATA === 'true'
const request = (path: string, init?: RequestInit) => fetch(`${API_BASE}${path}`, { credentials: 'include', ...init })

let lastRemoteData: StoredData | null = null
let lastRemoteManifest: RemoteDashboardManifest | null = null
export type SaveProgress = {
  completed: number
  total: number
  phase: 'chunks' | 'manifest'
  message: string
}

async function jsonError(res: Response, fallback: string) {
  try { return (await res.json()).error || fallback } catch { return fallback }
}

async function loadRemoteChunk<T>(key: string): Promise<T[]> {
  const res = await request(`/api/data/chunk?key=${encodeURIComponent(key)}`)
  if (!res.ok) throw new Error(await jsonError(res, `无法读取线上数据块：${key}`))
  return res.json()
}

export async function fetchData(): Promise<StoredData> {
  const res = await request('/api/data')
  if (!res.ok) throw new Error(await jsonError(res, '无法读取统一数据源'))
  const payload = await res.json()
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'manifest')) {
    const envelope = payload as RemoteDataEnvelope
    if (!envelope.manifest) {
      const empty = {
        ...EMPTY_DATA,
        version: envelope.version || {
          id: '',
          versionNumber: '未初始化',
          updatedAt: '',
          currentBaseDate: '',
          coverageStart: '',
          coverageEnd: '',
          batchTime: '',
          sourceFileName: '',
          source: '线上最新版本' as const,
        },
      }
      lastRemoteData = empty
      lastRemoteManifest = null
      return empty
    }
    const publicOptimized = !location.pathname.startsWith('/admin')
    const hydrated = await hydrateRemoteData(envelope.manifest, loadRemoteChunk, publicOptimized)
    lastRemoteData = hydrated
    lastRemoteManifest = envelope.manifest
    return hydrated
  }
  const local = { ...EMPTY_DATA, ...payload } as StoredData
  lastRemoteData = local
  lastRemoteManifest = null
  return local
}

const MAX_CHUNK_BYTES = 768 * 1024
const textBytes = (value: string) => new TextEncoder().encode(value).byteLength
const splitByBytes = <T>(items: T[]) => {
  const result: T[][] = []
  let current: T[] = []
  let currentBytes = 2
  items.forEach(item => {
    const itemBytes = textBytes(JSON.stringify(item)) + (current.length ? 1 : 0)
    if (itemBytes + 2 > MAX_CHUNK_BYTES) throw new Error(`chunk size too large：单条记录超过 ${Math.floor(MAX_CHUNK_BYTES / 1024)}KB`)
    if (current.length && currentBytes + itemBytes > MAX_CHUNK_BYTES) {
      result.push(current)
      current = []
      currentBytes = 2
    }
    current.push(item)
    currentBytes += itemBytes
  })
  if (current.length) result.push(current)
  return result
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

type UploadTracker = {
  completed: number
  total: number
  active: number
  waiters: Array<() => void>
  report?: (progress: SaveProgress) => void
}

const withUploadSlot = async <T,>(tracker: UploadTracker | undefined, task: () => Promise<T>) => {
  if (!tracker) return task()
  if (tracker.active >= 2) await new Promise<void>(resolve => tracker.waiters.push(resolve))
  tracker.active += 1
  try {
    return await task()
  } finally {
    tracker.active -= 1
    tracker.waiters.shift()?.()
  }
}

const reportChunkProgress = (tracker?: UploadTracker) => {
  if (!tracker?.report) return
  tracker.report({
    completed: tracker.completed,
    total: tracker.total,
    phase: 'chunks',
    message: tracker.total ? `正在保存 ${tracker.completed}/${tracker.total}` : '正在准备线上数据块',
  })
}

async function uploadChunks(items: unknown[], reusableKeys?: string[], tracker?: UploadTracker) {
  if (reusableKeys) return reusableKeys
  const chunks = splitByBytes(items)
  if (tracker) {
    tracker.total += chunks.length
    reportChunkProgress(tracker)
  }
  const prepared = await Promise.all(chunks.map(async chunk => {
    const serialized = JSON.stringify(chunk)
    const bytes = textBytes(serialized)
    if (bytes > MAX_CHUNK_BYTES) throw new Error(`chunk size too large：${Math.ceil(bytes / 1024)}KB`)
    return { key: `chunks/${await sha256(serialized)}`, serialized, bytes }
  }))
  let cursor = 0
  const workers = Array.from({ length: Math.min(2, prepared.length) }, async () => {
    while (cursor < prepared.length) {
      const current = prepared[cursor++]
      try {
        const res = await withUploadSlot(tracker, async () => {
          const controller = new AbortController()
          const timer = window.setTimeout(() => controller.abort(), 45000)
          try {
            return await request('/api/admin/data/chunk', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Chunk-Bytes': String(current.bytes) },
            body: `{"key":${JSON.stringify(current.key)},"items":${current.serialized}}`,
            signal: controller.signal,
            })
          } finally {
            window.clearTimeout(timer)
          }
        })
        if (!res.ok) {
          const detail = await jsonError(res, 'unknown error')
          if (res.status === 401) throw new Error('unauthorized：管理员登录已失效，请重新登录')
          if (res.status === 413) throw new Error(`chunk size too large：${detail}`)
          throw new Error(`Netlify Blobs write failed：${detail}（${current.key}）`)
        }
        if (tracker) {
          tracker.completed += 1
          reportChunkProgress(tracker)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`function timeout：数据块写入超过45秒（${current.key}）`)
        if (error instanceof Error) throw error
        throw new Error(`unknown error：数据块写入失败（${current.key}）`)
      }
    }
  })
  await Promise.all(workers)
  return prepared.map(item => item.key)
}

const sameBatchRows = (batch: SnapshotBatch, prior: StoredData | null) =>
  prior?.batches.find(item => item.id === batch.id)?.rows === batch.rows

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + days * 86400000).toISOString().slice(0, 10)
}

function compactPublicRows(rows: SnapshotRecord[]) {
  const groups = rows.reduce<Record<string, SnapshotRecord[]>>((result, row) => {
    const main = channelGroup(row)
    const otaDetail = main === '各OTA' && ['携程','美团','飞猪'].includes(row.channelLevel3 || row.channel)
      ? (row.channelLevel3 || row.channel) : main === '各OTA' ? 'OTA其他' : ''
    const key = `${row.whCode}|${row.targetDate}|${main}|${otaDetail}`
    ;(result[key] ||= []).push(row)
    return result
  }, {})
  return Object.values(groups).map(records => {
    const first = records[0]
    const main = channelGroup(first)
    const otaDetail = main === '各OTA' && ['携程','美团','飞猪'].includes(first.channelLevel3 || first.channel)
      ? (first.channelLevel3 || first.channel) : main === '各OTA' ? 'OTA其他' : ''
    const bookedRooms = records.reduce((sum, row) => sum + (row.bookedRooms || 0), 0)
    const pricedRooms = records.reduce((sum, row) => sum + (row.pricedRooms || 0), 0)
    const bookingRevenue = records.reduce((sum, row) => sum + (row.bookingRevenue || 0), 0)
    const availableRooms = Math.max(0, ...records.map(row => row.availableRooms || 0))
    return {
      ...first,
      availableRooms,
      bookedRooms,
      pricedRooms,
      bookingRevenue,
      bookingRate: availableRooms ? bookedRooms / availableRooms : undefined,
      onHandAdr: pricedRooms ? bookingRevenue / pricedRooms : undefined,
      theoreticalRp: availableRooms ? bookingRevenue / availableRooms : undefined,
      channel: otaDetail || main,
      channelLevel1: main,
      channelLevel2: main === '各OTA' ? 'OTA' : main,
      channelLevel3: otaDetail,
      channelNights: bookedRooms,
      channelRevenue: bookingRevenue,
    } satisfies SnapshotRecord
  })
}

function attachStoreInsights(
  batches: Array<{ batch: SnapshotBatch; rows: SnapshotRecord[] }>,
  previousRows: SnapshotRecord[],
  data: StoredData,
) {
  const archivedPrevious = previousRows.length && data.previousFinalSnapshot
    ? previousFinalAsBatch({ ...data.previousFinalSnapshot, rows: previousRows })
    : undefined
  return batches.map(({ batch, rows }, index, all) => {
    const current = { ...batch, rows }
    const prior = index > 0 ? { ...all[index - 1].batch, rows: all[index - 1].rows } : undefined
    const previous = mergePreviousByTargetDate(prior, archivedPrevious)
    const metrics = buildMetricRows(
      data.hotels,
      current,
      previous,
      data.lastYear,
      data.renovations || [],
      data.sameLeadSnapshots || [],
    )
    const insightByKey = [...new Set(metrics.map(row => row.targetDate))].reduce<Record<string, ReturnType<typeof buildStoreInsights>>>((result, targetDate) => {
      const dayRows = metrics.filter(row => row.targetDate === targetDate)
      const comparisonRows = buildComparisonRows(data.hotels, data.lastYear, targetDate).rows
      const dayChannelRows = rows.filter(row => row.targetDate === targetDate)
      result[targetDate] = buildStoreInsights(dayRows, comparisonRows, dayChannelRows, data.settings?.priceAdvice)
      return result
    }, {})
    const seen = new Set<string>()
    return {
      batch,
      rows: rows.map(row => {
        const key = `${row.whCode}|${row.targetDate}`
        if (seen.has(key)) return row
        seen.add(key)
        const insight = insightByKey[row.targetDate]?.[row.whCode]
        return insight ? { ...row, precomputedStoreInsight: insight } : row
      }),
    }
  })
}

async function publishVersionedData(data: StoredData, onProgress?: (progress: SaveProgress) => void): Promise<StoredData> {
  const version = createVersionInfo(data, '线上最新版本')
  const priorData = lastRemoteData
  const priorManifest = lastRemoteManifest
  const tracker: UploadTracker = { completed: 0, total: 0, active: 0, waiters: [], report: onProgress }
  const reusableArrays = {
    hotels: priorData?.hotels === data.hotels ? priorManifest?.arrays.hotels : undefined,
    lastYear: priorData?.lastYear === data.lastYear ? priorManifest?.arrays.lastYear : undefined,
    sameLeadSnapshots: priorData?.sameLeadSnapshots === data.sameLeadSnapshots ? priorManifest?.arrays.sameLeadSnapshots : undefined,
    renovations: priorData?.renovations === data.renovations ? priorManifest?.arrays.renovations : undefined,
    qualityIssues: priorData?.qualityIssues === data.qualityIssues ? priorManifest?.arrays.qualityIssues : undefined,
  }
  const targetDates = new Set(data.batches.flatMap(batch => batch.rows.map(row => row.targetDate)).filter(Boolean))
  const publicLastYearRows = data.lastYear.filter(row => row.mappedDate ? targetDates.has(row.mappedDate) : targetDates.has(addDays(row.date, 364)))
  const publicSameLeadRows = (data.sameLeadSnapshots || []).filter(row => targetDates.has(addDays(row.date, 364)))
  const publicPreviousRows = data.previousFinalSnapshot ? compactPublicRows(data.previousFinalSnapshot.rows.filter(row => targetDates.has(row.targetDate))) : []
  const publicBatchRows = attachStoreInsights(
    data.batches.map(batch => ({ batch, rows: compactPublicRows(batch.rows) })),
    publicPreviousRows,
    data,
  )
  const [hotels, lastYear, sameLeadSnapshots, renovations, qualityIssues, batches, previousRowKeys, publicLastYear, publicSameLeadSnapshots, publicBatches, publicPreviousRowKeys] = await Promise.all([
    uploadChunks(data.hotels, reusableArrays.hotels, tracker),
    uploadChunks(data.lastYear, reusableArrays.lastYear, tracker),
    uploadChunks(data.sameLeadSnapshots || [], reusableArrays.sameLeadSnapshots, tracker),
    uploadChunks(data.renovations || [], reusableArrays.renovations, tracker),
    uploadChunks(data.qualityIssues || [], reusableArrays.qualityIssues, tracker),
    Promise.all(data.batches.map(async batch => {
      const prior = priorManifest?.batches.find(item => item.id === batch.id)
      const rowKeys = await uploadChunks(batch.rows, sameBatchRows(batch, priorData) ? prior?.rowKeys : undefined, tracker)
      const { rows: _rows, ...meta } = batch
      return { ...meta, rowKeys } as RemoteBatchManifest
    })),
    data.previousFinalSnapshot
      ? uploadChunks(
          data.previousFinalSnapshot.rows,
          priorData?.previousFinalSnapshot?.rows === data.previousFinalSnapshot.rows
            ? priorManifest?.previousFinalSnapshot?.rowKeys
            : undefined,
          tracker,
        )
      : Promise.resolve([]),
    uploadChunks(publicLastYearRows, undefined, tracker),
    uploadChunks(publicSameLeadRows, undefined, tracker),
    Promise.all(publicBatchRows.map(async ({ batch, rows }) => {
      const { rows: _rows, ...meta } = batch
      return { ...meta, rowKeys: await uploadChunks(rows, undefined, tracker) } as RemoteBatchManifest
    })),
    data.previousFinalSnapshot ? uploadChunks(publicPreviousRows, undefined, tracker) : Promise.resolve([]),
  ])
  const previousFinalSnapshot = data.previousFinalSnapshot
    ? (() => {
        const { rows: _rows, ...meta } = data.previousFinalSnapshot!
        return { ...meta, rowKeys: previousRowKeys }
      })()
    : undefined
  const publicPreviousFinalSnapshot = data.previousFinalSnapshot
    ? (() => {
        const { rows: _rows, ...meta } = data.previousFinalSnapshot!
        return { ...meta, rowKeys: publicPreviousRowKeys }
      })()
    : undefined
  const manifest: RemoteDashboardManifest = {
    schemaVersion: 1,
    version,
    arrays: { hotels, lastYear, sameLeadSnapshots, renovations, qualityIssues, publicLastYear, publicSameLeadSnapshots },
    batches,
    publicBatches,
    previousFinalSnapshot,
    publicPreviousFinalSnapshot,
    state: {
      currentBaseDate: data.currentBaseDate || '',
      mappings: data.mappings,
      channelMappings: data.channelMappings,
      settings: data.settings,
    },
  }
  onProgress?.({
    completed: tracker.completed,
    total: tracker.total,
    phase: 'manifest',
    message: '数据块已全部保存，正在发布最新版本',
  })
  const res = await request('/api/admin/data/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  })
  if (!res.ok) throw new Error(await jsonError(res, '线上版本发布失败'))
  const saved = { ...data, version }
  lastRemoteData = saved
  lastRemoteManifest = manifest
  return saved
}

export async function saveServerData(data: StoredData, onProgress?: (progress: SaveProgress) => void): Promise<StoredData> {
  if (USE_VERSIONED_REMOTE) return publishVersionedData(data, onProgress)
  const res = await request('/api/admin/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  if (!res.ok) throw new Error(await jsonError(res, '保存失败'))
  const result = await res.json()
  const saved = { ...data, version: result.version || data.version }
  lastRemoteData = saved
  return saved
}

export async function fetchBroadcastState(): Promise<BroadcastState> {
  const res = await request('/api/admin/broadcast')
  if (!res.ok) throw new Error(await jsonError(res, '无法读取播报配置'))
  return res.json()
}

export async function saveBroadcastState(state: BroadcastState) {
  const res = await request('/api/admin/broadcast', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
  if (!res.ok) throw new Error(await jsonError(res, '保存播报配置失败'))
}

export async function generateBroadcast(input: { batchId: string; dayOffset: string; scope: BroadcastScope; config: BroadcastConfig }): Promise<BroadcastPackage> {
  const res = await request('/api/admin/broadcast/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  if (!res.ok) throw new Error(await jsonError(res, '预警播报生成失败'))
  return res.json()
}
