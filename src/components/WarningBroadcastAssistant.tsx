import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Copy, History, RefreshCw, Save, Settings2 } from 'lucide-react'
import type { BroadcastConfig, BroadcastLength, BroadcastPackage, BroadcastScope, BroadcastScopeLevel, BroadcastState, StoredData } from '../types/data'
import { fetchBroadcastState, generateBroadcast, saveBroadcastState } from '../utils/api'

const lengthLabels: Record<BroadcastLength, string> = { brief: '简版', standard: '标准版', detailed: '详细版' }
const levelLabels: Record<BroadcastScopeLevel, string> = { all: '华西区域整体', province: '省区', area: '片区', city: '城市', revenueZone: '收益管理商圈' }
const emptyScope: BroadcastScope = { level: 'all', value: '' }
const toWechat = (text: string) => text.split('\n').filter(Boolean).map(line => {
  const match = line.match(/^\d+\.\s*(.+)$/)
  return match ? `【${match[1]}】` : line
}).join('\n')

export default function WarningBroadcastAssistant({ data }: { data: StoredData }) {
  const latestBatch = data.batches.at(-1)
  const [state, setState] = useState<BroadcastState | null>(null)
  const [batchId, setBatchId] = useState(latestBatch?.id || '')
  const [dayOffset, setDayOffset] = useState('D0')
  const [scope, setScope] = useState<BroadcastScope>(emptyScope)
  const [length, setLength] = useState<BroadcastLength>('standard')
  const [result, setResult] = useState<BroadcastPackage | null>(null)
  const [drafts, setDrafts] = useState<Record<BroadcastLength, string>>({ brief: '', standard: '', detailed: '' })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfig, setShowConfig] = useState(true)
  const [generatedScope, setGeneratedScope] = useState<BroadcastScope>(emptyScope)

  useEffect(() => {
    fetchBroadcastState().then(next => {
      setState(next)
      setLength(next.config.defaultLength)
    }).catch(error => setMessage(error instanceof Error ? error.message : '读取播报配置失败'))
  }, [])

  const selectedBatch = data.batches.find(batch => batch.id === batchId) || latestBatch
  const dates = useMemo(() => [...new Set((selectedBatch?.rows || []).map(row => row.targetDate).filter(Boolean))]
    .sort().slice(0, 7).map((date, index) => ({ day: `D${index}`, date })), [selectedBatch])
  const scopeValues = useMemo(() => {
    if (scope.level === 'all') return []
    const key = scope.level
    return [...new Set(data.hotels.map(hotel => String(hotel[key] || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [data.hotels, scope.level])

  const runGenerate = async () => {
    if (!state || !selectedBatch) return
    if (scope.level !== 'all' && !scope.value) { setMessage('请选择具体播报范围'); return }
    setLoading(true); setMessage('')
    try {
      const next = await generateBroadcast({ batchId: selectedBatch.id, dayOffset, scope, config: state.config })
      setResult(next)
      setGeneratedScope({ ...scope })
      setDrafts({ brief: next.brief, standard: next.standard, detailed: next.detailed })
      setMessage('已按最新数据重新生成')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '生成失败')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (state && selectedBatch) runGenerate()
    // 初次载入配置与最新跑批后自动生成；后续由管理员点击重新生成。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.config.defaultLength, selectedBatch?.id])

  const copy = async (content: string, label = '已复制') => {
    try { await navigator.clipboard.writeText(content); setMessage(label) }
    catch { setMessage('复制失败，请手动选择文案复制') }
  }
  const saveConfig = async () => {
    if (!state) return
    try { await saveBroadcastState(state); setMessage('播报配置已保存') }
    catch (error) { setMessage(error instanceof Error ? error.message : '配置保存失败') }
  }
  const saveHistory = async () => {
    if (!state || !result) return
    const item = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      targetDate: result.meta.targetDate,
      batchId: result.meta.batchId,
      batchTime: result.meta.batchTime,
      scope: generatedScope,
      length,
      content: drafts[length],
    }
    const next = { ...state, history: [item, ...state.history].slice(0, 100) }
    try { await saveBroadcastState(next); setState(next); setMessage('历史版本已保存') }
    catch (error) { setMessage(error instanceof Error ? error.message : '历史版本保存失败') }
  }
  const updateConfig = <K extends keyof BroadcastConfig>(key: K, value: BroadcastConfig[K]) =>
    setState(current => current ? ({ ...current, config: { ...current.config, [key]: value } }) : current)
  const check = (key: keyof Pick<BroadcastConfig, 'showStoreDistribution' | 'showDirectOperation' | 'showCoreZone' | 'showPriceAdvice' | 'showNewOperation' | 'showRenovationOperation' | 'showChannelAnomaly' | 'showStoreRisk' | 'nameStores' | 'showChannelDetail' | 'showTopLists' | 'copyAsWechat'>, label: string) =>
    <label className="broadcast-check"><input type="checkbox" checked={!!state?.config[key]} onChange={event => updateConfig(key, event.target.checked)}/><span>{label}</span></label>

  if (!state) return <main className="broadcast-page"><div className="broadcast-loading"><RefreshCw/>正在读取管理员播报配置…</div></main>
  return <main className="broadcast-page">
    <div className="broadcast-hero">
      <div><span>ADMIN WARNING BROADCAST</span><h2>预警播报助手</h2><p>每日 10:20 / 14:20 / 21:20 三次预警 · 跟踪未来7天同一目标入住日期变化。</p></div>
      <div className="broadcast-hero-actions"><button onClick={() => setShowConfig(value => !value)}><Settings2/>配置项</button><button className="primary" onClick={runGenerate} disabled={loading}><RefreshCw className={loading ? 'spin' : ''}/>{loading ? '生成中' : '重新生成'}</button></div>
    </div>

    <section className="broadcast-controls">
      <label><span>目标跑批</span><select value={selectedBatch?.id || ''} onChange={event => setBatchId(event.target.value)}>{data.batches.map(batch => <option value={batch.id} key={batch.id}>跑批{batch.batchTime} · {batch.fileName}</option>)}</select></label>
      <label><span>目标日期</span><select value={dayOffset} onChange={event => setDayOffset(event.target.value)}>{dates.map(item => <option key={item.day} value={item.day} disabled={!item.date}>{item.day} · {item.date || '无数据'}</option>)}</select></label>
      <label><span>播报层级</span><select value={scope.level} onChange={event => setScope({ level: event.target.value as BroadcastScopeLevel, value: '' })}>{Object.entries(levelLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {scope.level !== 'all' && <label><span>具体范围</span><select value={scope.value} onChange={event => setScope(current => ({ ...current, value: event.target.value }))}><option value="">请选择</option>{scopeValues.map(value => <option key={value}>{value}</option>)}</select></label>}
      <div className="broadcast-length"><span>文案长度</span><div>{(Object.keys(lengthLabels) as BroadcastLength[]).map(value => <button className={length === value ? 'active' : ''} onClick={() => setLength(value)} key={value}>{lengthLabels[value]}</button>)}</div></div>
    </section>

    {showConfig && <section className="broadcast-config">
      <div className="broadcast-config-title"><Settings2/><div><b>管理员配置</b><small>修改后点击保存配置，再重新生成文案</small></div><button onClick={saveConfig}><Save/>保存配置</button></div>
      <div className="broadcast-config-grid">
        {check('showStoreDistribution', '展示门店分布')}
        {check('showCoreZone', '展示核心商圈关注')}
        {check('showStoreRisk', '展示门店风险')}
        {check('showPriceAdvice', '展示提价建议')}
        {check('showDirectOperation', '展示直营店专项')}
        {check('showNewOperation', '展示新开店专项')}
        {check('showRenovationOperation', '展示改造店专项')}
        {check('showChannelAnomaly', '展示渠道异常')}
        {check('nameStores', '点名具体门店')}
        {check('showChannelDetail', '展示渠道细分')}
        {check('showTopLists', '展示TOP榜')}
        {check('copyAsWechat', '默认企业微信格式')}
        <label><span>TOP榜数量</span><input type="number" min="1" max="10" value={state.config.topCount} onChange={event => updateConfig('topCount', Number(event.target.value))}/></label>
        <label><span>低预订率阈值</span><input type="number" min="0" max="100" value={state.config.lowBookingRate * 100} onChange={event => updateConfig('lowBookingRate', Number(event.target.value) / 100)}/><em>%</em></label>
        <label><span>默认文案长度</span><select value={state.config.defaultLength} onChange={event => updateConfig('defaultLength', event.target.value as BroadcastLength)}>{(Object.keys(lengthLabels) as BroadcastLength[]).map(value => <option value={value} key={value}>{lengthLabels[value]}</option>)}</select></label>
        <label className="wide"><span>直营识别字段</span><select multiple value={state.config.directFields} onChange={event => updateConfig('directFields', [...event.target.selectedOptions].map(option => option.value) as BroadcastConfig['directFields'])}><option value="operationType">经营类型</option><option value="managementType">管理类型</option></select></label>
        <label className="wide"><span>直营识别关键词（逗号分隔）</span><input value={state.config.directKeywords.join(',')} onChange={event => updateConfig('directKeywords', event.target.value.split(/[,，]/).map(value => value.trim()).filter(Boolean))}/></label>
      </div>
    </section>}

    <div className="broadcast-workspace">
      <section className="broadcast-editor">
        <div className="broadcast-card-head"><div><Clipboard/><span><b>{lengthLabels[length]}预警文案</b><small>可直接编辑，重新生成后恢复为最新数据文案</small></span></div>{result && <div className="broadcast-meta"><span>{result.meta.targetDate}</span><span>跑批{result.meta.batchTime}</span><span>{result.meta.scopeLabel}</span><span>{result.meta.previousLabel}</span></div>}</div>
        <textarea value={drafts[length]} onChange={event => setDrafts(current => ({ ...current, [length]: event.target.value }))}/>
        <div className="broadcast-editor-foot"><span>{drafts[length].length} 字</span><div>
          <button onClick={() => result && setDrafts(current => ({ ...current, [length]: result[length] }))}><RefreshCw/>恢复生成稿</button>
          <button onClick={() => copy(drafts[length])}><Copy/>复制纯文本</button>
          <button onClick={() => copy(toWechat(drafts[length]), '企业微信版已复制')}><Copy/>复制企业微信版</button>
          <button className="primary" onClick={saveHistory}><Save/>保存历史版本</button>
        </div></div>
        <div className="broadcast-quick-copy"><span>快速复制：</span>{(Object.keys(lengthLabels) as BroadcastLength[]).map(value => <button onClick={() => copy(state.config.copyAsWechat ? toWechat(drafts[value]) : drafts[value], `${lengthLabels[value]}已复制`)} key={value}>{lengthLabels[value]}</button>)}</div>
        {message && <div className="broadcast-message"><Check/>{message}</div>}
      </section>
      <aside className="broadcast-history">
        <div className="broadcast-card-head"><div><History/><span><b>历史版本</b><small>最多保存100条管理员播报</small></span></div></div>
        <div className="broadcast-history-list">{state.history.map(item => <button key={item.id} onClick={() => { setLength(item.length); setDrafts(current => ({ ...current, [item.length]: item.content })); setMessage('已载入历史版本') }}>
          <b>{item.targetDate} · 跑批{item.batchTime}</b><span>{item.scope.level === 'all' ? '华西区域整体' : item.scope.value} · {lengthLabels[item.length]}</span><small>{new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}</small>
        </button>)}{!state.history.length && <div className="broadcast-history-empty">尚未保存历史版本</div>}</div>
      </aside>
    </div>
  </main>
}
