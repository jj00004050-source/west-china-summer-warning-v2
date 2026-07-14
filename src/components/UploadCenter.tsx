import { useRef, useState } from 'react'
import { CheckCircle2, Database, FileSpreadsheet, History, Save, SlidersHorizontal, Trash2, Upload, XCircle } from 'lucide-react'
import type { DataKind, PriceAdviceSettings, QualityIssue, StoredData } from '../types/data'
import { autoMap } from '../utils/fieldMapping'
import { normalizeRows, readFile, validDate, validateRows, validateUploadStructure } from '../utils/parser'
import { downloadJson, importBackup } from '../utils/storage'
import FieldMapper from './FieldMapper'
import DataQualityPanel from './DataQualityPanel'
import { applySnapshotUpload } from '../utils/snapshotVersions'
import { DEFAULT_PRICE_ADVICE_SETTINGS } from '../utils/priceAdvice'
import type { SaveProgress } from '../utils/api'
import HotspotUploadPanel from './HotspotUploadPanel'

const kinds: Array<[DataKind, string, string]> = [
  ['hotels', '酒店维度表', '系统预置 · 低频维护'],
  ['lastYear', '去年同期暑期经营表', '系统预置 · 最终经营基准'],
  ['sameLeadSnapshots', '同期开盘预订快照表', '去年周对周 · 开盘预订基准'],
  ['snapshots', '未来7天预订快照表', '上传最新跑批 · 保留上一版环比'],
  ['renovations', '改造店明细', '可选维护 · 按WH编码关联'],
]
const warningMessage = (kind: DataKind) => kind === 'hotels'
  ? '存在数据警告，可继续保存；部分门店商圈或房量缺失，将影响商圈对标或门店标签展示。'
  : kind === 'lastYear'
    ? '存在数据警告，可继续保存；部分历史同期记录存在WH缺失、可售房为空或已售大于可售，将保留在异常清单中，不影响同期基准数据上传。'
    : kind === 'sameLeadSnapshots'
      ? '存在数据警告，可继续保存；异常日期行将跳过，未匹配门店及可售房缺失记录仅保留提示，不影响同期开盘基准保存。'
    : '存在数据警告，可继续保存；异常记录已保留在异常清单中。'
export default function UploadCenter({ data, onData }: { data: StoredData; onData: (d: StoredData, onProgress?: (progress: SaveProgress) => void) => void | Promise<void> }) {
  const [kind, setKind] = useState<DataKind>('snapshots'); const [raw, setRaw] = useState<Record<string, unknown>[]>([]); const [headers, setHeaders] = useState<string[]>([]); const [mapping, setMapping] = useState<Record<string, string>>({}); const [fileName, setFileName] = useState(''); const [issues, setIssues] = useState<QualityIssue[]>([]); const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null); const backupRef = useRef<HTMLInputElement>(null)
  const selectKind = (k: DataKind) => { setKind(k); setRaw([]); setIssues([]); setMessage('') }
  const kindCount = (value: DataKind) => value === 'hotels' ? data.hotels.length
    : value === 'lastYear' ? data.lastYear.length
      : value === 'sameLeadSnapshots' ? data.sameLeadSnapshots?.length || 0
        : value === 'snapshots' ? data.batches.length : data.renovations?.length || 0
  const load = async (file: File) => {
    try { const rows = await readFile(file); const hs = Object.keys(rows[0] || {}); setRaw(rows); setHeaders(hs); setFileName(file.name); setMapping(autoMap(hs, kind, data.mappings[kind])); setMessage('') }
    catch (e) { setMessage(`读取失败：${e instanceof Error ? e.message : '文件格式错误'}`) }
  }
  const validate = () => {
    const normalized = normalizeRows(raw, kind, mapping, data.channelMappings)
    const found = [...validateUploadStructure(raw, kind, mapping), ...validateRows(normalized, kind)]
    if (kind === 'snapshots' && !data.hotels.length) {
      found.unshift({ level: 'error', row: 1, field: '酒店维度表', message: '请先上传酒店维度表' })
    }
    setIssues(found)
    setMessage(found.some(issue => issue.level === 'error') ? '存在阻断性错误，请修正后再上传' : found.length ? warningMessage(kind) : '校验通过，可以保存')
    return { normalized, found }
  }
  const save = async () => {
    const { normalized, found } = validate()
    if (found.some(i => i.level === 'error')) {
      setMessage(kind === 'snapshots' && !data.hotels.length ? '请先上传酒店维度表' : '存在阻断性错误，请修正后再上传')
      return
    }
    let saveRows: unknown[] = normalized
    if (kind !== 'hotels') {
      const hotelCodes = new Set(data.hotels.map(h => h.whCode))
      const warned = new Set<string>()
      normalized.forEach((r, i) => { if (r.whCode && !hotelCodes.has(r.whCode) && !warned.has(r.whCode)) { warned.add(r.whCode); found.push({ level: 'warning', row: i + 2, field: '酒店WH编码', message: '无法匹配维度表', value: r.whCode }) } })
    }
    if (kind === 'snapshots' && data.lastYear.length) {
      const mapped = new Set(data.lastYear.filter(r => r.mappedDate).map(r => `${r.whCode}|${r.mappedDate}`))
      const dated = new Set(data.lastYear.map(r => `${r.whCode}|${r.date}`))
      const checked = new Set<string>()
      ;(normalized as StoredData['batches'][number]['rows']).forEach((r, i) => {
        const key = `${r.whCode}|${r.targetDate}`; if (checked.has(key)) return; checked.add(key)
        const [year, month, day] = r.targetDate.split('-').map(Number)
        const wow = year && month && day
          ? new Date(Date.UTC(year, month - 1, day) - 364 * 86400000).toISOString().slice(0, 10)
          : ''
        if (!mapped.has(key) && !dated.has(`${r.whCode}|${wow}`)) found.push({ level: 'warning', row: i + 2, field: '同期数据', message: `缺少周对周同期数据（${wow}）`, value: r.whCode })
      })
    }
    if (kind === 'renovations') {
      const hotelByCode = new Map(data.hotels.map(hotel => [hotel.whCode, hotel]))
      const seen = new Set<string>()
      const unique: NonNullable<StoredData['renovations']> = []
      ;(normalized as NonNullable<StoredData['renovations']>).forEach((record, index) => {
        if (seen.has(record.whCode)) {
          found.push({ level: 'warning', row: index + 2, field: '酒店WH编码', message: 'WH编码重复，已保留首条记录', value: record.whCode })
          return
        }
        seen.add(record.whCode)
        unique.push(record)
        const hotel = hotelByCode.get(record.whCode)
        if (hotel && !['在营','在营业'].includes(String(hotel.status || '').trim())) {
          found.push({ level: 'warning', row: index + 2, field: '经营状态', message: `当前门店状态为“${hotel.status || '未配置'}”，不会进入改造店专项`, value: record.whCode })
        }
      })
      saveRows = unique
    }
    if (kind === 'sameLeadSnapshots') {
      saveRows = (normalized as NonNullable<StoredData['sameLeadSnapshots']>).filter(record => record.whCode && validDate(record.date))
      if (!saveRows.length) {
        setMessage('存在阻断性错误：完全没有可保存的有效数据行')
        return
      }
    }
    setIssues([...found])
    const next = { ...data, qualityIssues: found, mappings: { ...data.mappings, [kind]: mapping } }
    if (kind === 'hotels') next.hotels = saveRows as StoredData['hotels']
    if (kind === 'lastYear') next.lastYear = saveRows as StoredData['lastYear']
    if (kind === 'sameLeadSnapshots') next.sameLeadSnapshots = saveRows as NonNullable<StoredData['sameLeadSnapshots']>
    if (kind === 'renovations') next.renovations = saveRows as NonNullable<StoredData['renovations']>
    if (kind === 'snapshots') {
      const records = normalized as StoredData['batches'][number]['rows']
      try { Object.assign(next, applySnapshotUpload(next, records, fileName)) }
      catch (e) { setMessage(e instanceof Error ? e.message : '快照版本保存失败'); return }
    }
    try {
      setSaving(true)
      await onData(next, kind === 'snapshots' || kind === 'sameLeadSnapshots' ? progress => setMessage(progress.message) : undefined)
      const warningSuffix = found.some(issue => issue.level === 'warning') ? `；${warningMessage(kind)}` : ''
      if (kind === 'snapshots') {
        const dates = [...new Set((saveRows as StoredData['batches'][number]['rows']).map(row => row.targetDate).filter(Boolean))].sort()
        const currentBatch = next.batches.at(-1)
        setMessage(`上传成功：D0 已更新为 ${dates[0] || '--'}，覆盖 ${dates[0] || '--'} 至 ${dates.at(-1) || '--'}，当前仅发布跑批${currentBatch?.batchTime || '--'}，共保存 ${currentBatch?.rows.length || 0} 行${warningSuffix}`)
      } else setMessage(`上传成功：服务端已保存 ${saveRows.length} 行标准数据${warningSuffix}`)
      setRaw([])
    }
    catch (e) { setMessage(`保存失败：${e instanceof Error ? e.message : '服务端写入异常'}`) }
    finally { setSaving(false) }
  }
  const exportClean = async () => {
    const { utils, writeFile } = await import('xlsx')
    const wb = utils.book_new()
    utils.book_append_sheet(wb, utils.json_to_sheet(data.hotels), 'DimHotel')
    utils.book_append_sheet(wb, utils.json_to_sheet(data.lastYear), 'LastYearSummer')
    utils.book_append_sheet(wb, utils.json_to_sheet(data.sameLeadSnapshots || []), 'SameLeadBookingSnapshot')
    utils.book_append_sheet(wb, utils.json_to_sheet(data.batches.flatMap(b => b.rows)), 'FutureBookingSnapshot')
    utils.book_append_sheet(wb, utils.json_to_sheet(data.renovations || []), 'Renovations')
    writeFile(wb, '华西预警清洗标准数据.xlsx')
  }
  const downloadTemplate = async (templateKind: DataKind) => {
    const { utils, writeFile } = await import('xlsx')
    const headers = templateKind === 'hotels'
      ? ['酒店名称','酒店WH编码','酒店区域','酒店省区','省总姓名','酒店片区','片区总姓名','经营状态','经营类型','管理类型','酒店品牌','省份','城市','城市等级','行政区域','酒店商圈','商圈属性','收益管理商圈','开业日期','财务品牌定位','中国区品牌定位','城市市场属性','店总姓名','物理房量']
      : templateKind === 'lastYear'
        ? ['酒店名称','酒店省区','酒店片区','酒店WH编码','年月日','综合主营业务收入','过夜房收入','总营业收入','已售房间数','可售房数','已售过夜房数','已售钟点房','钟点房收入','会议室收入']
        : templateKind === 'sameLeadSnapshots'
          ? ['酒店名称','酒店WH编码','年月日','预订房间总数（已售房）','有房价的预订房间数','预订总价','可售房间数']
        : templateKind === 'snapshots'
          ? ['酒店名称','酒店WH编码','年月日','跑批次数','一级渠道','二级渠道','三级渠道','预订房间总数（已售房）','可售房间数','预订总价','有房价的预订房间数']
          : ['酒店WH编码','改造类型']
    const wb = utils.book_new()
    utils.book_append_sheet(wb, utils.aoa_to_sheet([headers]), '上传模板')
    utils.book_append_sheet(wb, utils.aoa_to_sheet([['字段名','说明','是否必填'], ...headers.map(h => [h, `请填写${h}`, ['酒店WH编码','年月日','跑批次数','可售房间数','改造类型'].includes(h) ? '是' : '否'])]), '字段说明')
    writeFile(wb, `${kinds.find(x => x[0] === templateKind)?.[1]}模板.xlsx`)
  }
  const restore = async (file: File) => { try { await onData(await importBackup(file)); setMessage('备份已恢复到统一服务端') } catch (e) { setMessage(e instanceof Error ? e.message : '恢复失败') } }
  const priceSettings = { ...DEFAULT_PRICE_ADVICE_SETTINGS, ...data.settings?.priceAdvice, minBookingRateByDay: { ...DEFAULT_PRICE_ADVICE_SETTINGS.minBookingRateByDay, ...data.settings?.priceAdvice?.minBookingRateByDay } }
  const updatePriceSetting = (key: keyof PriceAdviceSettings, value: number) => onData({
    ...data,
    settings: { ...data.settings, priceAdvice: { ...priceSettings, [key]: value } },
  })
  return <main className="upload-page">
    <div className="upload-hero"><div><span className="eyebrow">DATA OPERATIONS CENTER</span><h2>数据上传中心</h2><p>自动识别字段、校验数据质量，并将确认后的数据写入统一服务端。</p></div>
      <div className="upload-summary"><span><b>{data.hotels.length}</b>门店</span><span><b>{data.lastYear.length}</b>同期最终记录</span><span><b>{data.sameLeadSnapshots?.length || 0}</b>同期开盘快照</span><span><b>{data.batches.length}</b>当前快照批次</span><span><b>{data.renovations?.length || 0}</b>改造记录</span></div>
    </div>
    <HotspotUploadPanel/>
    <div className="upload-grid"><section className="panel upload-main">
      <div className="template-actions">{kinds.map(([k, label]) => <button key={k} onClick={() => downloadTemplate(k)}>下载{label}模板</button>)}</div>
      <div className="kind-tabs">{kinds.map(([k, label, code]) => <button className={kind === k ? 'active' : ''} onClick={() => selectKind(k)} key={k}><FileSpreadsheet size={18}/><span>{label}<small>{code}</small></span>{kindCount(k) > 0 && <CheckCircle2 size={16}/>}</button>)}</div>
      {!raw.length ? <div className="drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]) }} onClick={() => fileRef.current?.click()}><Upload size={42}/><h3>拖拽或点击上传 Excel / CSV</h3><p>支持 .xlsx、.xls、.csv，默认读取第一个工作表</p><button>选择文件</button><input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && load(e.target.files[0])}/></div> :
      <><div className="mapping-head"><div><b>{fileName}</b><span>{raw.length} 行 · {headers.length} 个源字段</span></div><button onClick={() => setRaw([])}><XCircle size={15}/>重新选择</button></div><h3 className="subheading">字段映射</h3><FieldMapper kind={kind} headers={headers} mapping={mapping} onChange={setMapping}/>
      {kind === 'snapshots' && mapping.channel && <><h3 className="subheading">渠道名称统一</h3><div className="channel-mapper">{[...new Set(raw.map(r => String(r[mapping.channel] || '').trim()).filter(Boolean))].map(source => <label key={source}><span>{source}</span><select value={data.channelMappings[source] || source} onChange={e => onData({ ...data, channelMappings: { ...data.channelMappings, [source]: e.target.value } })}>{['官网', 'OTA', '携程', '美团', '飞猪', '直连分销', '前台', '会员', '商旅', '其他', source].filter((v, i, a) => a.indexOf(v) === i).map(v => <option key={v}>{v}</option>)}</select></label>)}</div></>}
      <h3 className="subheading">数据预览（前5行）</h3><div className="preview-table"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{raw.slice(0, 5).map((r, i) => <tr key={i}>{headers.map(h => <td key={h}>{String(r[h] ?? '')}</td>)}</tr>)}</tbody></table></div>
      <DataQualityPanel issues={issues}/><div className="upload-actions"><button disabled={saving} onClick={validate}>执行校验</button><button disabled={saving} className="primary" onClick={save}><Save size={15}/>{saving ? '正在保存…' : '校验并保存'}</button></div></>}
      {message && <div className={`upload-message ${/失败|错误|阻断/.test(message) ? 'error' : 'success'}`}>{message}</div>}
    </section>
    <aside className="panel batch-history"><div className="panel-title compact"><div><span className="eyebrow">SNAPSHOT HISTORY</span><h2>快照批次历史</h2></div><History size={19}/></div>
      <div className="batch-list">{[...data.batches].reverse().map(b => <div key={b.id}><span className="batch-time">{b.batchTime}</span><span><b>{data.currentBaseDate || b.snapshotDate}</b><small>当前发布跑批 · {b.fileName} · {b.rows.length}行</small></span><button title="删除批次" onClick={() => onData({ ...data, batches: data.batches.filter(x => x.id !== b.id) })}><Trash2 size={15}/></button></div>)}{data.previousFinalSnapshot && <div><span className="batch-time">环比</span><span><b>{data.previousFinalSnapshot.baseDate}</b><small>上一版跑批基准 · {data.previousFinalSnapshot.rows.length}行</small></span></div>}{!data.batches.length && <div className="empty-mini">尚未上传快照</div>}</div>
      <div className="data-actions"><button onClick={exportClean}>导出标准数据</button><button onClick={() => downloadJson(data)}>导出数据备份</button><button onClick={() => backupRef.current?.click()}>导入备份恢复</button><input hidden ref={backupRef} type="file" accept=".json" onChange={e => e.target.files?.[0] && restore(e.target.files[0])}/>
      <button className="danger" onClick={() => confirm('确定清空服务端全部经营数据？此操作不可撤销。') && onData({ hotels: [], lastYear: [], sameLeadSnapshots: [], batches: [], currentBaseDate: '', previousFinalSnapshot: undefined, mappings: data.mappings, channelMappings: data.channelMappings, settings: data.settings })}><Trash2 size={14}/>清空全部数据</button></div>
      <label className="missing-zero-setting"><input type="checkbox" checked={data.settings?.countMissingBookingAsZero !== false} onChange={e => onData({ ...data, settings: { ...data.settings, countMissingBookingAsZero: e.target.checked } })}/><span><b>缺失预订门店计入0预定数</b><small>仅针对维度表中当前在营、但目标日期完全无预订记录的门店</small></span></label>
      <section className="channel-threshold-settings price-threshold-settings"><div><SlidersHorizontal/><span><b>提价建议阈值</b><small>D0-D6门槛及商圈、ADR、样本量规则</small></span></div>
        <div className="price-day-thresholds">{['D0','D1','D2','D3','D4','D5','D6'].map(day => <label key={day}><span>{day}</span><div><input type="number" min="0" max="100" value={Math.round((priceSettings.minBookingRateByDay[day] || 0) * 100)} onChange={event => onData({ ...data, settings: { ...data.settings, priceAdvice: { ...priceSettings, minBookingRateByDay: { ...priceSettings.minBookingRateByDay, [day]: Number(event.target.value) / 100 } } } })}/><em>%</em></div></label>)}</div>
        <div className="channel-threshold-grid">{([
          ['strongZoneGapPp','强提价高于商圈','pp'],['mildZoneGapPp','小幅提价高于商圈','pp'],['lowZoneGapPp','明显低于商圈','pp'],
          ['highAdrAmount','ADR明显高于','元'],['highAdrRate','ADR高于比例','%'],['lowAdrAmount','ADR明显低于','元'],['lowAdrRate','ADR低于比例','%'],['storeRecoveryGapPp','本店恢复差','pp'],
          ['zoneRecoveryGapPp','商圈恢复差','pp'],['minBookedRooms','最少预订间夜','间夜'],['minPricedRooms','最少有价间夜','间夜'],
          ['minZoneStores','最少商圈门店','家'],['lowRemainingRate','低剩余房率','%'],
        ] as Array<[keyof PriceAdviceSettings,string,string]>).map(([key,label,unit]) => {
          const percent = unit === '%' || unit === 'pp'
          const raw = priceSettings[key] as number
          return <label key={key}><span>{label}</span><div><input type="number" value={percent ? Math.round(raw * 100) : raw} onChange={event => updatePriceSetting(key, Number(event.target.value) / (percent ? 100 : 1))}/><em>{unit}</em></div></label>
        })}</div>
      </section>
      <div className="local-note"><Database size={16}/><span>基准日取文件内最早“年月日”。现在每次只需上传最新跑批；系统发布本次最大跑批，并自动保留上一版同目标入住日期跑批作为环比基准。</span></div>
    </aside></div>
  </main>
}
