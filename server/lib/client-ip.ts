import 'server-only'

function normalizeIp(value: string): string | null {
  let ip = value.trim().replace(/^\[|\]$/g, '')
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped) ip = mapped[1]
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip)
  if (withPort) ip = withPort[1]
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').every((part) => Number(part) <= 255) ? ip : null
  }
  return /^[0-9a-f:]+$/i.test(ip) && ip.includes(':') ? ip : null
}

/** Only headers written by the configured edge proxy are trusted as client IP. */
export function clientIpFromHeaders(header: (name: string) => string | undefined): string {
  const mode = (process.env.TRUSTED_PROXY_MODE || '').trim().toLowerCase()
  const value = mode === 'cloudflare'
    ? header('cf-connecting-ip')
    : mode === 'vercel'
      ? header('x-vercel-forwarded-for')
      : mode === 'forwarded'
        ? header('x-forwarded-for')?.split(',')[0]?.trim()
        : undefined
  return normalizeIp(value || '') ?? '127.0.0.1'
}
