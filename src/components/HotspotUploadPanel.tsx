import { useEffect, useRef, useState } from 'react'
import { CalendarRange, CheckCircle2, Flame, Save, Upload } from 'lucide-react'
import type { RevenueHotspotData } from '../types/hotspots'
import { fetchHotspotData, saveHotspotData } from '../utils/api'
import { buildHotspotData, normalizeHotspotRows } from '../utils/hotspots'

export default function HotspotUploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [prepared, setPrepared] = useState<RevenueHotspotData | null>(null)
  const [current, setCurrent] = useState<RevenueHotspotData | null>(null)
  const [fileName, setFileName] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchHotspotData().then(setCurrent).catch(() => setCurrent(null))
  }, [])

  const load = async (file: File) => {
    setMessage('正在解析热点Excel…')
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sheetName = workbook.SheetNames.find(name => name.includes('明细')) || workbook.SheetNames[0]
      if (!sheetName) throw new Error('Excel中没有可读取的工作表')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: true })
      const parsed = normalizeHotspotRows(rows)
      const data = buildHotspotData(file.name, parsed.rows)
      setPrepared(data)
      setFileName(file.name)
      setWarnings(parsed.warnings)
      setMessage(`已解析 ${data.summary.total} 条热点，覆盖 ${data.summary.provinceCount} 个省区；保存后将整体覆盖当前热点版本。`)
    } catch (error) {
      setPrepared(null)
      setMessage(`读取失败：${error instanceof Error ? error.message : '文件格式无法识别'}`)
    }
  }

  const save = async () => {
    if (!prepared) return
    try {
      setSaving(true)
      await saveHotspotData(prepared, progress => setMessage(progress.message))
      setCurrent(prepared)
      setPrepared(null)
      setWarnings([])
      setMessage(`上传成功：已发布 ${prepared.summary.total} 条热点，线上版本 ${prepared.version.versionNumber}`)
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : '服务端写入异常'}`)
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel hotspot-upload-panel">
    <div className="hotspot-upload-title">
      <div className="hotspot-upload-icon"><Flame/></div>
      <div><span className="eyebrow">SUMMER REVENUE HOTSPOTS</span><h2>暑期收益热点</h2><p>上传热点Excel后一次解析为轻量JSON；新文件整体覆盖当前热点版本，不累计历史明细。</p></div>
      {current && <div className="hotspot-current-version"><CheckCircle2/><span><small>当前线上热点</small><b>{current.summary.total} 条 · {current.version.versionNumber}</b><em>{current.version.coverageStart} 至 {current.version.coverageEnd}</em></span></div>}
    </div>
    <div className="hotspot-upload-body">
      <button className="hotspot-file-button" onClick={() => inputRef.current?.click()}><Upload/>选择热点Excel</button>
      <input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={event => event.target.files?.[0] && load(event.target.files[0])}/>
      <div className="hotspot-file-summary">
        <CalendarRange/>
        {prepared ? <span><b>{fileName}</b><small>{prepared.summary.total} 条热点 · {prepared.summary.provinceCount} 个省区 · {prepared.summary.highHeatCityCount} 个高热度城市</small></span> :
          <span><b>同期支持“明细”工作表</b><small>识别省份、城市、类别、热度、项目名称、地点及起止日期等字段</small></span>}
      </div>
      <button className="hotspot-save-button" disabled={!prepared || saving} onClick={save}><Save/>{saving ? '正在发布…' : '校验并保存'}</button>
    </div>
    {warnings.length > 0 && <div className="hotspot-upload-warnings">存在 {warnings.length} 条数据提示：{warnings.slice(0, 3).join('；')}{warnings.length > 3 ? '……' : ''}</div>}
    {message && <div className={`upload-message ${/失败|错误/.test(message) ? 'error' : 'success'}`}>{message}</div>}
  </section>
}
