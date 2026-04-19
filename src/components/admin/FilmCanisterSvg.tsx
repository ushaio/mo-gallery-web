'use client'

import { useId } from 'react'

interface FilmCanisterSvgProps {
  /** Number of photos taken / total frames */
  photoCount?: number
  frameCount?: number
  /** Film brand name displayed on label */
  brand?: string
  /** ISO speed displayed on label */
  iso?: number
  /** Accent color for the canister label */
  accentColor?: string
  className?: string
}

const BRAND_COLORS: Record<string, string> = {
  // Kodak family (specific stocks first)
  portra: '#d4956a',
  ektachrome: '#ff6b35',
  ultramax: '#2980b9',
  colorplus: '#e67e22',
  'tri-x': '#333333',
  ektar: '#c0392b',
  tmax: '#222222',
  gold: '#d4a017',
  trix: '#333333',
  kodak: '#fdb813',
  // Fujifilm family
  fujifilm: '#00a651',
  velvia: '#c0392b',
  provia: '#1976d2',
  superia: '#27ae60',
  pro400h: '#1abc9c',
  acros: '#2c2c2c',
  natura: '#e91e63',
  fuji: '#00a651',
  // Ilford family
  ilford: '#1a1a1a',
  panf: '#2c3e50',
  delta: '#455a64',
  hp5: '#4a4a4a',
  fp4: '#666666',
  xp2: '#78909c',
  sfx: '#6d4c41',
  // CineStill
  '800t': '#d32f2f',
  '400d': '#fbc02d',
  '50d': '#039be5',
  cinestill: '#e63946',
  // Lomography
  lomography: '#9b59b6',
  redscale: '#d35400',
  lomo: '#9b59b6',
  // Other manufacturers
  kentmere: '#607d8b',
  bergger: '#5d4037',
  rollei: '#34495e',
  foma: '#37474f',
  agfa: '#e74c3c',
  adox: '#263238',
  jch: '#3f51b5',
}

// Sort by key length desc so more-specific keys (e.g. "portra") match before
// generic brand names (e.g. "kodak") when scanning a display string.
const BRAND_COLOR_ENTRIES = Object.entries(BRAND_COLORS).sort(
  (a, b) => b[0].length - a[0].length,
)

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function fallbackBrandColor(brand: string): string {
  const hue = hashString(brand) % 360
  return `hsl(${hue}, 58%, 42%)`
}

function getBrandColor(brand: string): string {
  const trimmed = brand.trim()
  if (!trimmed) return '#6b7280'
  const lower = trimmed.toLowerCase()
  for (const [key, color] of BRAND_COLOR_ENTRIES) {
    if (lower.includes(key)) return color
  }
  return fallbackBrandColor(lower)
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = hex.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)
  if (!match) return null
  const value = match[1]
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value
  const num = parseInt(full, 16)
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

function hslLightness(hsl: string): number | null {
  const match = hsl.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/i)
  if (!match) return null
  return Number(match[1]) / 100
}

function getReadableTextColor(bg: string): string {
  const rgb = hexToRgb(bg)
  if (rgb) {
    const [r, g, b] = rgb.map((v) => {
      const n = v / 255
      return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
    })
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance > 0.55 ? '#1a1a1a' : '#ffffff'
  }
  const lightness = hslLightness(bg)
  if (lightness != null) return lightness > 0.6 ? '#1a1a1a' : '#ffffff'
  return '#ffffff'
}

/**
 * SVG illustration of a 35mm film canister (暗盒) for film roll list items.
 * Shows exposure progress, brand, and ISO on the label area.
 */
export function FilmCanisterSvg({
  photoCount = 0,
  frameCount = 36,
  brand = '',
  iso,
  accentColor,
  className = '',
}: FilmCanisterSvgProps) {
  const uid = useId()
  const capGradId = `fc-cap-${uid}`
  const labelGradId = `fc-label-${uid}`
  const labelShadeId = `fc-label-shade-${uid}`
  const leaderGradId = `fc-leader-${uid}`
  const progressGradId = `fc-progress-${uid}`
  const tongueGradId = `fc-tongue-${uid}`

  const color = accentColor || getBrandColor(brand)
  const textColor = getReadableTextColor(color)
  const progress = frameCount > 0 ? Math.min(photoCount / frameCount, 1) : 0
  const leaderLength = 22 - progress * 16
  const leaderEndX = 70 + leaderLength + 14
  const holeCount = Math.max(2, Math.ceil((leaderLength + 12) / 4))

  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={`Film canister: ${brand} ISO ${iso}, ${photoCount}/${frameCount} frames`}
    >
      <defs>
        {/* Metal cap (top/bottom) */}
        <linearGradient id={capGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8d8d8" />
          <stop offset="0.4" stopColor="#a2a2a2" />
          <stop offset="0.7" stopColor="#6a6a6a" />
          <stop offset="1" stopColor="#323232" />
        </linearGradient>
        {/* Spool tongue (protruding from top cap) */}
        <linearGradient id={tongueGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8b8b8" />
          <stop offset="1" stopColor="#5a5a5a" />
        </linearGradient>
        {/* Brand-colored label wrapping the cylinder */}
        <linearGradient id={labelGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0.7" />
          <stop offset="0.35" stopColor={color} stopOpacity="1" />
          <stop offset="0.65" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
        {/* Top/bottom cylindrical shading on label */}
        <linearGradient id={labelShadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="black" stopOpacity="0.3" />
          <stop offset="0.15" stopColor="black" stopOpacity="0" />
          <stop offset="0.85" stopColor="black" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity="0.35" />
        </linearGradient>
        {/* Film leader (emulsion-side shading) */}
        <linearGradient id={leaderGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a4a3b" />
          <stop offset="0.25" stopColor="#3d3529" />
          <stop offset="0.75" stopColor="#3d3529" />
          <stop offset="1" stopColor="#241e18" />
        </linearGradient>
        {/* Progress fill */}
        <linearGradient id={progressGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0.95" />
          <stop offset="1" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="50" cy="74" rx="28" ry="1.6" fill="#000" opacity="0.25" />

      {/* Spool tongue (sticks up above the top cap) */}
      <rect x={44} y={4} width={12} height={6} rx={1.4} fill={`url(#${tongueGradId})`} />
      <rect x={45} y={6.2} width={10} height={1.6} rx={0.5} fill="#141414" />
      <rect x={45} y={4.8} width={10} height={0.6} rx={0.3} fill="white" opacity="0.5" />

      {/* Top cap */}
      <rect x={28} y={9} width={44} height={7} rx={2} fill={`url(#${capGradId})`} />
      <line
        x1={30}
        y1={12.5}
        x2={70}
        y2={12.5}
        stroke="#000"
        strokeWidth="4"
        strokeDasharray="0.5,1.2"
        opacity="0.32"
      />
      <line x1={28} y1={10.2} x2={72} y2={10.2} stroke="white" strokeWidth="0.4" opacity="0.55" />
      <line x1={28} y1={15.6} x2={72} y2={15.6} stroke="#000" strokeWidth="0.4" opacity="0.5" />

      {/* Canister body (brand-colored label wraps the cylinder) */}
      <rect x={30} y={14} width={40} height={50} rx={1.5} fill={`url(#${labelGradId})`} />
      <rect x={30} y={14} width={40} height={50} rx={1.5} fill={`url(#${labelShadeId})`} />
      {/* Cylindrical rim highlights */}
      <rect x={30.5} y={14.5} width={1.5} height={49} rx={0.5} fill="white" opacity="0.22" />
      <rect x={68} y={14.5} width={1.5} height={49} rx={0.5} fill="black" opacity="0.28" />

      {/* Brand text (upper label area) */}
      <text
        x={50}
        y={25}
        textAnchor="middle"
        fontSize={6}
        fontWeight="bold"
        fill={textColor}
        fontFamily="system-ui, sans-serif"
        letterSpacing={0.6}
        opacity="0.98"
      >
        {brand.toUpperCase().slice(0, 10)}
      </text>
      {/* Separator line under brand */}
      <line x1={34} y1={29} x2={66} y2={29} stroke={textColor} strokeWidth="0.3" opacity="0.35" />

      {/* Light seal (dark exit slot on the right side of body) */}
      <rect x={68} y={30} width={2.2} height={22} fill="#070707" />
      <line
        x1={68.4}
        y1={30.5}
        x2={68.4}
        y2={51.5}
        stroke="#342a22"
        strokeWidth="0.4"
        strokeDasharray="0.5,0.4"
        opacity="0.85"
      />

      {/* Film leader (emerges from the light seal) */}
      <rect
        x={70}
        y={31}
        width={leaderLength + 14}
        height={20}
        fill={`url(#${leaderGradId})`}
      />
      {/* Leader rounded tip */}
      <path
        d={`M${leaderEndX},33 Q${leaderEndX + 3.5},41 ${leaderEndX},49`}
        fill={`url(#${leaderGradId})`}
      />
      {/* Sprocket holes (both edges) */}
      {Array.from({ length: holeCount }, (_, i) => (
        <g key={i} transform={`translate(${i * 4}, 0)`}>
          <rect x={72} y={32.5} width={2} height={2.4} rx={0.3} fill="#120f0a" />
          <rect x={72} y={47} width={2} height={2.4} rx={0.3} fill="#120f0a" />
        </g>
      ))}
      {/* Centerline highlight across leader */}
      <line
        x1={72}
        y1={40.8}
        x2={leaderEndX - 1}
        y2={40.8}
        stroke="#6e5a48"
        strokeWidth="0.3"
        opacity="0.55"
      />

      {/* Info strip (below leader) */}
      {iso && (
        <g>
          <rect x={32} y={54.5} width={14} height={6} rx={0.8} fill="#f5f0e8" />
          <rect x={32} y={54.5} width={14} height={1} rx={0.4} fill="white" opacity="0.7" />
          <text
            x={39}
            y={59.3}
            textAnchor="middle"
            fontSize={3.8}
            fontWeight="bold"
            fill="#1a1a1a"
            fontFamily="system-ui, sans-serif"
          >
            ISO {iso}
          </text>
        </g>
      )}
      {/* Progress bar */}
      <rect x={48} y={54.5} width={20} height={6} rx={0.8} fill="#0b0b0b" opacity="0.75" />
      <rect
        x={48.8}
        y={55.3}
        width={18.4 * progress}
        height={4.4}
        rx={0.4}
        fill={`url(#${progressGradId})`}
      />
      <text
        x={58}
        y={59}
        textAnchor="middle"
        fontSize={3.3}
        fill="white"
        fontFamily="system-ui, sans-serif"
        opacity={0.95}
      >
        {photoCount}/{frameCount}
      </text>

      {/* Bottom cap */}
      <rect x={28} y={62} width={44} height={7} rx={2} fill={`url(#${capGradId})`} />
      <line
        x1={30}
        y1={65.5}
        x2={70}
        y2={65.5}
        stroke="#000"
        strokeWidth="4"
        strokeDasharray="0.5,1.2"
        opacity="0.32"
      />
      <line x1={28} y1={62.6} x2={72} y2={62.6} stroke="white" strokeWidth="0.4" opacity="0.55" />
      <line x1={28} y1={68.6} x2={72} y2={68.6} stroke="#000" strokeWidth="0.4" opacity="0.5" />
    </svg>
  )
}
