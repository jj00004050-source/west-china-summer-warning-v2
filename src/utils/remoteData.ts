import type {
  DashboardVersionInfo,
  PreviousFinalSnapshot,
  QualityIssue,
  RenovationRecord,
  SameLeadSnapshotRecord,
  SnapshotBatch,
  StoredData,
} from '../types/data'

export interface RemoteBatchManifest extends Omit<SnapshotBatch, 'rows'> {
  rowKeys: string[]
}

export interface RemotePreviousSnapshotManifest extends Omit<PreviousFinalSnapshot, 'rows'> {
  rowKeys: string[]
}

export interface RemoteDashboardManifest {
  schemaVersion: 1
  version: DashboardVersionInfo
  arrays: {
    hotels: string[]
    lastYear: string[]
    sameLeadSnapshots?: string[]
    renovations: string[]
    qualityIssues: string[]
    publicLastYear?: string[]
    publicSameLeadSnapshots?: string[]
  }
  batches: RemoteBatchManifest[]
  publicBatches?: RemoteBatchManifest[]
  previousFinalSnapshot?: RemotePreviousSnapshotManifest
  publicPreviousFinalSnapshot?: RemotePreviousSnapshotManifest
  state: Pick<StoredData, 'currentBaseDate' | 'mappings' | 'channelMappings' | 'settings'>
}

export interface RemoteDataEnvelope {
  version: DashboardVersionInfo | null
  manifest: RemoteDashboardManifest | null
}

export const remoteChunkKeys = (manifest: RemoteDashboardManifest) => [
  ...manifest.arrays.hotels,
  ...manifest.arrays.lastYear,
  ...(manifest.arrays.sameLeadSnapshots || []),
  ...manifest.arrays.renovations,
  ...manifest.arrays.qualityIssues,
  ...(manifest.arrays.publicLastYear || []),
  ...(manifest.arrays.publicSameLeadSnapshots || []),
  ...manifest.batches.flatMap(batch => batch.rowKeys),
  ...(manifest.publicBatches || []).flatMap(batch => batch.rowKeys),
  ...(manifest.previousFinalSnapshot?.rowKeys || []),
  ...(manifest.publicPreviousFinalSnapshot?.rowKeys || []),
]

async function loadArray<T>(keys: string[], loadChunk: (key: string) => Promise<T[]>): Promise<T[]> {
  if (!keys.length) return []
  const chunks = await Promise.all(keys.map(loadChunk))
  return chunks.flat()
}

export async function hydrateRemoteData(
  manifest: RemoteDashboardManifest,
  loadChunk: <T>(key: string) => Promise<T[]>,
  publicOptimized = false,
): Promise<StoredData> {
  const sourceBatches = publicOptimized && manifest.publicBatches ? manifest.publicBatches : manifest.batches
  const lastYearKeys = publicOptimized && manifest.arrays.publicLastYear ? manifest.arrays.publicLastYear : manifest.arrays.lastYear
  const sameLeadKeys = publicOptimized && manifest.arrays.publicSameLeadSnapshots ? manifest.arrays.publicSameLeadSnapshots : (manifest.arrays.sameLeadSnapshots || [])
  const previousManifest = publicOptimized && manifest.publicPreviousFinalSnapshot ? manifest.publicPreviousFinalSnapshot : manifest.previousFinalSnapshot
  const [hotels, lastYear, sameLeadSnapshots, renovations, qualityIssues, batches, previousRows] = await Promise.all([
    loadArray(manifest.arrays.hotels, loadChunk),
    loadArray(lastYearKeys, loadChunk),
    loadArray<SameLeadSnapshotRecord>(sameLeadKeys, loadChunk),
    loadArray<RenovationRecord>(manifest.arrays.renovations, loadChunk),
    publicOptimized ? Promise.resolve([]) : loadArray<QualityIssue>(manifest.arrays.qualityIssues, loadChunk),
    Promise.all(sourceBatches.map(async batch => {
      const { rowKeys, ...meta } = batch
      return { ...meta, rows: await loadArray(rowKeys, loadChunk) } as SnapshotBatch
    })),
    previousManifest
      ? loadArray(previousManifest.rowKeys, loadChunk)
      : Promise.resolve([]),
  ])
  const previousFinalSnapshot = previousManifest
    ? (() => {
        const { rowKeys: _rowKeys, ...meta } = previousManifest
        return { ...meta, rows: previousRows } as PreviousFinalSnapshot
      })()
    : undefined
  return {
    hotels: hotels as StoredData['hotels'],
    lastYear: lastYear as StoredData['lastYear'],
    sameLeadSnapshots,
    renovations,
    batches,
    previousFinalSnapshot,
    qualityIssues,
    currentBaseDate: manifest.state.currentBaseDate,
    mappings: manifest.state.mappings,
    channelMappings: manifest.state.channelMappings,
    settings: manifest.state.settings,
    version: manifest.version,
    publicOptimized,
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

export function createVersionInfo(data: StoredData, source: DashboardVersionInfo['source']): DashboardVersionInfo {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const dates = [...new Set(data.batches.flatMap(batch => batch.rows.map(row => row.targetDate)).filter(Boolean))].sort()
  const latest = data.batches.at(-1)
  return {
    id: `v${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    versionNumber: `V${stamp}`,
    updatedAt: now.toISOString(),
    currentBaseDate: data.currentBaseDate || dates[0] || '',
    coverageStart: dates[0] || '',
    coverageEnd: dates.at(-1) || '',
    batchTime: latest?.batchTime || '',
    sourceFileName: latest?.fileName || '',
    source,
  }
}
