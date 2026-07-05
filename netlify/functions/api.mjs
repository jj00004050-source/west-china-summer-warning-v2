import { getStore } from '@netlify/blobs'
import { DEFAULT_BROADCAST_CONFIG, generateBroadcastPackage } from '../../server/broadcast-generator.mjs'

const STORE_NAME = 'west-china-dashboard'
const CURRENT_VERSION_KEY = 'currentVersion'
const PREVIOUS_VERSION_KEY = 'previousVersion'
const BROADCAST_KEY = 'broadcastState'
const HOTSPOT_VERSION_KEY = 'hotspotCurrentVersion'
const store = () => getStore({ name: STORE_NAME, consistency: 'strong' })
const MAX_CHUNK_BYTES = 768 * 1024
const json = (value, status = 200, headers = {}) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
})
const normalizePath = pathname => pathname.startsWith('/.netlify/functions/api')
  ? `/api${pathname.slice('/.netlify/functions/api'.length)}`
  : pathname
const requireAdmin = () => null
const validChunkKey = key => /^chunks\/[a-f0-9]{64}$/.test(String(key || ''))
const versionManifestKey = versionId => `versions/${String(versionId).replace(/[^a-zA-Z0-9._-]/g, '')}/manifest`
const hotspotManifestKey = versionId => `hotspot-versions/${String(versionId).replace(/[^a-zA-Z0-9._-]/g, '')}/manifest`
const allChunkKeys = manifest => [
  ...(manifest?.arrays?.hotels || []),
  ...(manifest?.arrays?.lastYear || []),
  ...(manifest?.arrays?.sameLeadSnapshots || []),
  ...(manifest?.arrays?.renovations || []),
  ...(manifest?.arrays?.qualityIssues || []),
  ...(manifest?.arrays?.publicLastYear || []),
  ...(manifest?.arrays?.publicSameLeadSnapshots || []),
  ...(manifest?.batches || []).flatMap(batch => batch.rowKeys || []),
  ...(manifest?.publicBatches || []).flatMap(batch => batch.rowKeys || []),
  ...(manifest?.previousFinalSnapshot?.rowKeys || []),
  ...(manifest?.publicPreviousFinalSnapshot?.rowKeys || []),
]
const hotspotChunkKeys = manifest => [
  ...(manifest?.arrays?.summary || []),
  ...(manifest?.arrays?.rows || []),
]
const loadArray = async (blobStore, keys = []) => (await Promise.all(keys.map(key => blobStore.get(key, { type: 'json', consistency: 'strong' })))).flatMap(value => Array.isArray(value) ? value : [])
const hydrate = async (blobStore, manifest) => {
  const [hotels, lastYear, sameLeadSnapshots, renovations, qualityIssues, batches, previousRows] = await Promise.all([
    loadArray(blobStore, manifest.arrays.hotels),
    loadArray(blobStore, manifest.arrays.lastYear),
    loadArray(blobStore, manifest.arrays.sameLeadSnapshots || []),
    loadArray(blobStore, manifest.arrays.renovations),
    loadArray(blobStore, manifest.arrays.qualityIssues),
    Promise.all(manifest.batches.map(async batch => {
      const { rowKeys, ...meta } = batch
      return { ...meta, rows: await loadArray(blobStore, rowKeys) }
    })),
    manifest.previousFinalSnapshot ? loadArray(blobStore, manifest.previousFinalSnapshot.rowKeys) : [],
  ])
  const previousFinalSnapshot = manifest.previousFinalSnapshot
    ? (() => {
        const { rowKeys: _rowKeys, ...meta } = manifest.previousFinalSnapshot
        return { ...meta, rows: previousRows }
      })()
    : undefined
  return {
    hotels,
    lastYear,
    sameLeadSnapshots,
    renovations,
    qualityIssues,
    batches,
    previousFinalSnapshot,
    ...manifest.state,
    version: manifest.version,
  }
}
const readCurrent = async blobStore => {
  const pointer = await blobStore.get(CURRENT_VERSION_KEY, { type: 'json', consistency: 'strong' })
  if (!pointer?.manifestKey) return { pointer: null, manifest: null }
  const manifest = await blobStore.get(pointer.manifestKey, { type: 'json', consistency: 'strong' })
  return { pointer, manifest }
}
const missingChunkKeys = async (blobStore, keys) => {
  const unique = [...new Set(keys)]
  const existing = new Set()
  for await (const page of blobStore.list({ prefix: 'chunks/', paginate: true })) {
    page.blobs.forEach(item => existing.add(item.key))
  }
  return unique.filter(key => !existing.has(key))
}
const blobError = error => {
  const message = error instanceof Error ? error.message : String(error || '')
  const name = error instanceof Error ? error.name : ''
  if (/MissingBlobsEnvironment|environment|site.?id|token/i.test(`${name} ${message}`)) {
    return { status: 503, code: 'missing_environment_variables', error: 'missing environment variables：Netlify Blobs 运行环境未正确初始化' }
  }
  if (/unauthor|forbidden|401|403/i.test(message)) {
    return { status: 401, code: 'unauthorized', error: 'unauthorized：Netlify Blobs 无写入权限' }
  }
  if (/key|invalid/i.test(message)) {
    return { status: 400, code: 'invalid_key', error: `invalid key：${message}` }
  }
  if (/timeout|timed out|deadline/i.test(message)) {
    return { status: 504, code: 'function_timeout', error: `function timeout：${message}` }
  }
  return { status: 500, code: 'blobs_write_failed', error: `Netlify Blobs write failed：${message || 'unknown error'}` }
}
const cleanupOldVersions = async (blobStore, currentPointer, previousPointer) => {
  try {
    const retainedManifestKeys = new Set([currentPointer?.manifestKey, previousPointer?.manifestKey].filter(Boolean))
    const retainedChunkKeys = new Set()
    for (const key of retainedManifestKeys) {
      const manifest = await blobStore.get(key, { type: 'json', consistency: 'strong' })
      allChunkKeys(manifest).forEach(chunkKey => retainedChunkKeys.add(chunkKey))
    }
    const hotspotPointer = await blobStore.get(HOTSPOT_VERSION_KEY, { type: 'json', consistency: 'strong' })
    if (hotspotPointer?.manifestKey) {
      const hotspotManifest = await blobStore.get(hotspotPointer.manifestKey, { type: 'json', consistency: 'strong' })
      hotspotChunkKeys(hotspotManifest).forEach(chunkKey => retainedChunkKeys.add(chunkKey))
    }
    const [{ blobs: manifests }, { blobs: chunks }] = await Promise.all([
      blobStore.list({ prefix: 'versions/' }),
      blobStore.list({ prefix: 'chunks/' }),
    ])
    await Promise.all([
      ...manifests.filter(item => !retainedManifestKeys.has(item.key)).map(item => blobStore.delete(item.key)),
      ...chunks.filter(item => !retainedChunkKeys.has(item.key)).map(item => blobStore.delete(item.key)),
    ])
  } catch (error) {
    console.warn('线上旧版本清理未完成：', error)
  }
}

const cleanupOldHotspots = async (blobStore, currentHotspotPointer) => {
  try {
    const retainedChunkKeys = new Set()
    const currentPointer = await blobStore.get(CURRENT_VERSION_KEY, { type: 'json', consistency: 'strong' })
    const previousPointer = await blobStore.get(PREVIOUS_VERSION_KEY, { type: 'json', consistency: 'strong' })
    for (const pointer of [currentPointer, previousPointer]) {
      if (!pointer?.manifestKey) continue
      const manifest = await blobStore.get(pointer.manifestKey, { type: 'json', consistency: 'strong' })
      allChunkKeys(manifest).forEach(chunkKey => retainedChunkKeys.add(chunkKey))
    }
    const currentManifest = currentHotspotPointer?.manifestKey
      ? await blobStore.get(currentHotspotPointer.manifestKey, { type: 'json', consistency: 'strong' })
      : null
    hotspotChunkKeys(currentManifest).forEach(chunkKey => retainedChunkKeys.add(chunkKey))
    const [{ blobs: manifests }, { blobs: chunks }] = await Promise.all([
      blobStore.list({ prefix: 'hotspot-versions/' }),
      blobStore.list({ prefix: 'chunks/' }),
    ])
    await Promise.all([
      ...manifests.filter(item => item.key !== currentHotspotPointer?.manifestKey).map(item => blobStore.delete(item.key)),
      ...chunks.filter(item => !retainedChunkKeys.has(item.key)).map(item => blobStore.delete(item.key)),
    ])
  } catch (error) {
    console.warn('旧热点版本清理未完成：', error)
  }
}

export default async request => {
  const url = new URL(request.url)
  const path = normalizePath(url.pathname)
  try {
    const blobStore = store()
    if (request.method === 'GET' && path === '/api/data') {
      const { manifest } = await readCurrent(blobStore)
      return json({ version: manifest?.version || null, manifest: manifest || null })
    }
    if (request.method === 'GET' && path === '/api/hotspots') {
      const pointer = await blobStore.get(HOTSPOT_VERSION_KEY, { type: 'json', consistency: 'strong' })
      if (!pointer?.manifestKey) return json({ version: null, manifest: null }, 404)
      const manifest = await blobStore.get(pointer.manifestKey, { type: 'json', consistency: 'strong' })
      if (!manifest) return json({ error: '热点版本清单不存在' }, 404)
      return json({ version: manifest.version, manifest })
    }
    if (request.method === 'GET' && path === '/api/data/chunk') {
      const key = url.searchParams.get('key')
      if (!validChunkKey(key)) return json({ error: '数据块地址不正确' }, 400)
      const value = await blobStore.get(key, { type: 'text' })
      if (value == null) return json({ error: '数据块不存在' }, 404)
      return new Response(value, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }
    if (request.method === 'GET' && path === '/api/admin/session') return json({ authenticated: true })
    if (request.method === 'POST' && path === '/api/admin/login') {
      return json({ ok: true, authenticated: true })
    }
    if (request.method === 'POST' && path === '/api/admin/logout') {
      return json({ ok: true })
    }
    if (request.method === 'PUT' && path === '/api/admin/data/chunk') {
      const denied = requireAdmin(request); if (denied) return denied
      const declaredBytes = Number(request.headers.get('x-chunk-bytes') || request.headers.get('content-length') || 0)
      if (declaredBytes > MAX_CHUNK_BYTES + 1024) {
        return json({ code: 'chunk_size_too_large', error: `chunk size too large：${Math.ceil(declaredBytes / 1024)}KB，单块上限为 ${MAX_CHUNK_BYTES / 1024}KB` }, 413)
      }
      const body = await request.json()
      if (!validChunkKey(body?.key)) return json({ code: 'invalid_key', error: 'invalid key：数据块地址必须为 chunks/ 加64位SHA-256值' }, 400)
      if (!Array.isArray(body?.items)) return json({ code: 'invalid_chunk', error: '数据块结构不正确：items 必须为数组' }, 400)
      const actualBytes = Buffer.byteLength(JSON.stringify(body.items))
      if (actualBytes > MAX_CHUNK_BYTES) {
        return json({ code: 'chunk_size_too_large', error: `chunk size too large：${Math.ceil(actualBytes / 1024)}KB，单块上限为 ${MAX_CHUNK_BYTES / 1024}KB` }, 413)
      }
      try {
        await blobStore.setJSON(body.key, body.items, { onlyIfNew: true })
        const written = await blobStore.getMetadata(body.key, { consistency: 'strong' })
        if (!written) return json({ code: 'blobs_write_failed', error: 'Netlify Blobs write failed：写入后未能读取数据块元数据' }, 500)
        return json({ ok: true, key: body.key, bytes: actualBytes })
      } catch (error) {
        const detail = blobError(error)
        return json({ code: detail.code, error: detail.error }, detail.status)
      }
    }
    if (request.method === 'POST' && path === '/api/admin/data/publish') {
      const denied = requireAdmin(request); if (denied) return denied
      const manifest = await request.json()
      if (manifest?.schemaVersion !== 1 || !manifest?.version?.id || !manifest?.arrays || !Array.isArray(manifest?.batches)) {
        return json({ error: '版本清单结构不正确' }, 400)
      }
      const chunkKeys = allChunkKeys(manifest)
      if (chunkKeys.some(key => !validChunkKey(key))) return json({ error: '版本清单包含无效数据块' }, 400)
      const missing = await missingChunkKeys(blobStore, chunkKeys)
      if (missing.length) return json({ error: `仍有 ${missing.length} 个数据块未成功保存：${missing.slice(0, 3).join('、')}` }, 409)
      const manifestKey = versionManifestKey(manifest.version.id)
      const prior = await blobStore.get(CURRENT_VERSION_KEY, { type: 'json', consistency: 'strong' })
      const pointer = { version: manifest.version, manifestKey }
      await blobStore.setJSON(manifestKey, manifest)
      if (prior?.manifestKey) await blobStore.setJSON(PREVIOUS_VERSION_KEY, prior)
      await blobStore.setJSON(CURRENT_VERSION_KEY, pointer)
      await cleanupOldVersions(blobStore, pointer, prior)
      return json({ ok: true, version: manifest.version })
    }
    if (request.method === 'POST' && path === '/api/admin/hotspots/publish') {
      const denied = requireAdmin(request); if (denied) return denied
      const manifest = await request.json()
      if (manifest?.schemaVersion !== 1 || !manifest?.version?.id || !manifest?.arrays ||
        !Array.isArray(manifest?.arrays?.summary) || !Array.isArray(manifest?.arrays?.rows)) {
        return json({ error: '热点版本清单结构不正确' }, 400)
      }
      const chunkKeys = hotspotChunkKeys(manifest)
      if (!chunkKeys.length || chunkKeys.some(key => !validChunkKey(key))) return json({ error: '热点版本清单包含无效数据块' }, 400)
      const missing = await missingChunkKeys(blobStore, chunkKeys)
      if (missing.length) return json({ error: `仍有 ${missing.length} 个热点数据块未成功保存` }, 409)
      const manifestKey = hotspotManifestKey(manifest.version.id)
      const pointer = { version: manifest.version, manifestKey }
      await blobStore.setJSON(manifestKey, manifest)
      await blobStore.setJSON(HOTSPOT_VERSION_KEY, pointer)
      await cleanupOldHotspots(blobStore, pointer)
      return json({ ok: true, version: manifest.version })
    }
    if (path.startsWith('/api/admin/broadcast')) {
      const denied = requireAdmin(request); if (denied) return denied
      if (request.method === 'GET' && path === '/api/admin/broadcast') {
        const stored = await blobStore.get(BROADCAST_KEY, { type: 'json', consistency: 'strong' })
        return json({ config: { ...DEFAULT_BROADCAST_CONFIG, ...(stored?.config || {}) }, history: Array.isArray(stored?.history) ? stored.history : [] })
      }
      if (request.method === 'PUT' && path === '/api/admin/broadcast') {
        const body = await request.json()
        if (!body || typeof body.config !== 'object' || !Array.isArray(body.history)) return json({ error: '播报配置结构不正确' }, 400)
        await blobStore.setJSON(BROADCAST_KEY, { config: { ...DEFAULT_BROADCAST_CONFIG, ...body.config }, history: body.history.slice(0, 100) })
        return json({ ok: true, updatedAt: new Date().toISOString() })
      }
      if (request.method === 'POST' && path === '/api/admin/broadcast/generate') {
        const { manifest } = await readCurrent(blobStore)
        if (!manifest) return json({ error: '线上数据版本尚未初始化' }, 409)
        return json(generateBroadcastPackage(await hydrate(blobStore, manifest), await request.json()))
      }
    }
    return json({ error: '接口不存在' }, 404)
  } catch (error) {
    console.error(error)
    const detail = blobError(error)
    return json({ code: detail.code, error: detail.error }, detail.status)
  }
}
