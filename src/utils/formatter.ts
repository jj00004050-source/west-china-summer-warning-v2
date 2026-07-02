export const fmtMoney = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '--'
  const a = Math.abs(v)
  if (a >= 1e8) return `${(v / 1e8).toFixed(1)}亿`
  if (a >= 1e4) return `${(v / 1e4).toFixed(1)}万`
  return v.toFixed(a < 100 ? 1 : 0)
}
export const fmtPct = (v: number | null | undefined) => v == null ? '--' : `${(v * 100).toFixed(2)}%`
export const fmtPp = (v: number | null | undefined) => v == null ? '--' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}pp`
export const fmtNum = (v: number | null | undefined) => v == null ? '--' : v.toFixed(Math.abs(v) < 100 ? 1 : 0)
export const delta = (v: number | null | undefined) => v == null ? '暂无上一批次' : `${v >= 0 ? '↑' : '↓'} ${fmtNum(Math.abs(v))}`
export const riskText = { high: '高风险', watch: '关注', normal: '正常', leading: '领先' } as const
