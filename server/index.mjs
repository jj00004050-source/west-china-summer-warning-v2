import 'dotenv/config'
import express from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDefaultBaseData } from './default-base-data.mjs'
import { DEFAULT_BROADCAST_CONFIG, generateBroadcastPackage } from './broadcast-generator.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDir = process.env.DATA_DIR || join(root, 'server', 'data')
const dataFile = join(dataDir, 'store.json')
const broadcastFile = join(dataDir, 'broadcast.json')
const hotspotFile = join(dataDir, 'hotspots.json')
const port = Number(process.env.PORT || 8787)
const empty = { hotels: [], lastYear: [], sameLeadSnapshots: [], renovations: [], batches: [], currentBaseDate: '', previousFinalSnapshot: undefined, mappings: {}, channelMappings: {}, qualityIssues: [], settings: { countMissingBookingAsZero: true } }
const emptyBroadcast = { config: DEFAULT_BROADCAST_CONFIG, history: [] }
const pad = value => String(value).padStart(2, '0')
const localVersion = data => {
  if (data.version?.source === '本地统一服务') return data.version
  const latest = data.batches?.at(-1)
  const updated = latest?.uploadTime ? new Date(latest.uploadTime) : new Date()
  const stamp = `${updated.getFullYear()}${pad(updated.getMonth() + 1)}${pad(updated.getDate())}-${pad(updated.getHours())}${pad(updated.getMinutes())}${pad(updated.getSeconds())}`
  const dates = [...new Set((data.batches || []).flatMap(batch => batch.rows.map(row => row.targetDate)).filter(Boolean))].sort()
  return {
    id: `local-${stamp}`,
    versionNumber: `LOCAL-${stamp}`,
    updatedAt: updated.toISOString(),
    currentBaseDate: data.currentBaseDate || dates[0] || '',
    coverageStart: dates[0] || '',
    coverageEnd: dates.at(-1) || '',
    batchTime: latest?.batchTime || '',
    sourceFileName: latest?.fileName || '',
    source: '本地统一服务',
  }
}
const withLocalVersion = data => ({ ...empty, ...data, version: localVersion({ ...empty, ...data }) })

await mkdir(dataDir, { recursive: true })
if (!existsSync(dataFile)) await writeFile(dataFile, JSON.stringify(empty, null, 2))
if (!existsSync(broadcastFile)) await writeFile(broadcastFile, JSON.stringify(emptyBroadcast, null, 2))
if (!existsSync(hotspotFile)) await writeFile(hotspotFile, 'null')
const readStore = async () => {
  try { return withLocalVersion(JSON.parse(await readFile(dataFile, 'utf8'))) } catch { return withLocalVersion(empty) }
}
let writeQueue = Promise.resolve()
const writeStore = data => {
  writeQueue = writeQueue.then(() => writeFile(dataFile, JSON.stringify({ ...empty, ...data }, null, 2)))
  return writeQueue
}
const readBroadcast = async () => {
  try {
    const stored = JSON.parse(await readFile(broadcastFile, 'utf8'))
    return { ...emptyBroadcast, ...stored, config: { ...DEFAULT_BROADCAST_CONFIG, ...(stored.config || {}) }, history: Array.isArray(stored.history) ? stored.history : [] }
  } catch { return emptyBroadcast }
}
let broadcastWriteQueue = Promise.resolve()
const writeBroadcast = data => {
  const next = { config: { ...DEFAULT_BROADCAST_CONFIG, ...(data.config || {}) }, history: Array.isArray(data.history) ? data.history.slice(0, 100) : [] }
  broadcastWriteQueue = broadcastWriteQueue.then(() => writeFile(broadcastFile, JSON.stringify(next, null, 2)))
  return broadcastWriteQueue
}
const readHotspots = async () => {
  try { return JSON.parse(await readFile(hotspotFile, 'utf8')) } catch { return null }
}
let hotspotWriteQueue = Promise.resolve()
const writeHotspots = data => {
  hotspotWriteQueue = hotspotWriteQueue.then(() => writeFile(hotspotFile, JSON.stringify(data)))
  return hotspotWriteQueue
}
const existing = await readStore()
const needsHotelEnrichment = existing.hotels.some(hotel => hotel.operationType == null || hotel.managementType == null)
if (!existing.hotels.length || !existing.lastYear.length || !existing.renovations?.length || needsHotelEnrichment) {
  console.log('正在初始化系统预置的维度表和去年同期经营数据…')
  const defaults = loadDefaultBaseData(root)
  const defaultHotelByCode = new Map(defaults.hotels.map(hotel => [hotel.whCode, hotel]))
  const enrichedHotels = existing.hotels.length
    ? existing.hotels.map(hotel => {
      const source = defaultHotelByCode.get(hotel.whCode)
      return {
        ...hotel,
        operationType: hotel.operationType || source?.operationType || '',
        managementType: hotel.managementType || source?.managementType || '',
      }
    })
    : defaults.hotels
  await writeStore({
    ...existing,
    hotels: enrichedHotels,
    lastYear: existing.lastYear.length ? existing.lastYear : defaults.lastYear,
    renovations: existing.renovations?.length ? existing.renovations : defaults.renovations,
  })
  console.log(`基础数据初始化完成：${defaults.hotels.length} 家门店，${defaults.lastYear.length} 条同期记录，${defaults.renovations.length} 条改造记录`)
}
const requireAdmin = (_req, _res, next) => next()

const app = express()
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '300mb' }))
app.get('/api/data', async (_req, res) => res.json(await readStore()))
app.get('/api/hotspots', async (_req, res) => {
  const hotspots = await readHotspots()
  if (!hotspots) return res.status(404).json({ error: '尚未上传暑期收益热点数据' })
  res.json(hotspots)
})
app.get('/api/admin/session', (_req, res) => res.json({ authenticated: true }))
app.post('/api/admin/login', (_req, res) => res.json({ ok: true, authenticated: true }))
app.post('/api/admin/logout', (_req, res) => res.json({ ok: true }))
app.put('/api/admin/data', requireAdmin, async (req, res) => {
  const next = req.body
  if (!next || !Array.isArray(next.hotels) || !Array.isArray(next.lastYear) || !Array.isArray(next.batches)) return res.status(400).json({ error: '数据结构不正确' })
  const versioned = withLocalVersion({ ...next, version: undefined })
  await writeStore(versioned); res.json({ ok: true, updatedAt: versioned.version.updatedAt, version: versioned.version })
})
app.put('/api/admin/hotspots', requireAdmin, async (req, res) => {
  const next = req.body
  if (!next?.version?.id || !next?.summary || !Array.isArray(next?.rows)) return res.status(400).json({ error: '热点数据结构不正确' })
  await writeHotspots(next)
  res.json({ ok: true, version: next.version })
})
app.get('/api/admin/broadcast', requireAdmin, async (_req, res) => res.json(await readBroadcast()))
app.put('/api/admin/broadcast', requireAdmin, async (req, res) => {
  const next = req.body
  if (!next || typeof next.config !== 'object' || !Array.isArray(next.history)) return res.status(400).json({ error: '播报配置结构不正确' })
  await writeBroadcast(next)
  res.json({ ok: true, updatedAt: new Date().toISOString() })
})
app.post('/api/admin/broadcast/generate', requireAdmin, async (req, res) => {
  try { res.json(generateBroadcastPackage(await readStore(), req.body || {})) }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '预警播报生成失败' }) }
})

const dist = join(root, 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) => res.sendFile(join(dist, 'index.html')))
}
app.listen(port, () => console.log(`华西预警数据服务已启动：http://localhost:${port}`))
