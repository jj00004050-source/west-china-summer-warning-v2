const CHANNELS: Record<string, string> = {
  ctrip: '携程', 携程旅行: '携程', 携程: '携程', meituan: '美团', 美团: '美团',
  fliggy: '飞猪', 飞猪: '飞猪', ota: 'OTA', 官网: '官网', web: '官网',
  直连: '直连分销', 直连分销: '直连分销', 前台: '前台', walkin: '前台',
  会员: '会员', 商旅: '商旅', corporate: '商旅',
}
export function normalizeChannel(value: unknown, custom: Record<string, string>) {
  const raw = String(value ?? '').trim()
  if (!raw) return '其他'
  return custom[raw] || CHANNELS[raw.toLowerCase()] || CHANNELS[raw] || raw
}
