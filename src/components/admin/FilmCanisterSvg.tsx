'use client'

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
  kodak: '#fdb813',
  fujifilm: '#00a651',
  fuji: '#00a651',
  ilford: '#1a1a1a',
  cinestill: '#e63946',
  lomography: '#9b59b6',
  lomo: '#9b59b6',
  agfa: '#e74c3c',
  foma: '#2c3e50',
  rollei: '#34495e',
  kentmere: '#555',
  portra: '#d4956a',
  ektar: '#c0392b',
  gold: '#f1c40f',
  ultramax: '#2980b9',
  colorplus: '#e67e22',
  superia: '#27ae60',
  pro400h: '#1abc9c',
  acros: '#2c2c2c',
  trix: '#333',
  'tri-x': '#333',
  hp5: '#444',
  delta: '#555',
  fp4: '#666',
}

function getBrandColor(brand: string): string {
  const lower = brand.toLowerCase()
  for (const [key, color] of Object.entries(BRAND_COLORS)) {
    if (lower.includes(key)) return color
  }
  return '#e63946'
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
  const color = accentColor || getBrandColor(brand)
  const progress = frameCount > 0 ? Math.min(photoCount / frameCount, 1) : 0
  // Film leader tongue sticks out more when fewer frames are shot
  const leaderLength = 24 - progress * 18

  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={`Film canister: ${brand} ISO ${iso}, ${photoCount}/${frameCount} frames`}
    >
      {/* Film leader / tongue coming out of canister */}
      <g>
        {/* Film strip base */}
        <rect
          x={78}
          y={32}
          width={leaderLength + 16}
          height={16}
          rx={1}
          fill="#3d3529"
        />
        {/* Sprocket holes on film strip */}
        {Array.from({ length: Math.ceil((leaderLength + 16) / 8) }).map((_, i) => (
          <g key={i}>
            <rect
              x={80 + i * 8}
              y={33.5}
              width={3}
              height={2.5}
              rx={0.5}
              fill="#1a1612"
            />
            <rect
              x={80 + i * 8}
              y={44}
              width={3}
              height={2.5}
              rx={0.5}
              fill="#1a1612"
            />
          </g>
        ))}
        {/* Film tongue rounded end */}
        <path
          d={`M${78 + leaderLength + 16},36
              Q${82 + leaderLength + 16},40 ${78 + leaderLength + 16},44`}
          fill="#3d3529"
        />
      </g>

      {/* Main canister body - cylindrical shape */}
      <rect x={16} y={12} width={64} height={56} rx={4} fill="#2a2a2a" />

      {/* Top flange */}
      <rect x={14} y={10} width={68} height={6} rx={3} fill="#404040" />
      {/* Bottom flange */}
      <rect x={14} y={64} width={68} height={6} rx={3} fill="#404040" />

      {/* Canister spool hub (top view circle) */}
      <circle cx={48} cy={40} r={18} fill="#1a1a1a" />
      <circle cx={48} cy={40} r={14} fill="#222" stroke="#333" strokeWidth={0.5} />
      {/* Spool fork slots */}
      <rect x={45} y={30} width={6} height={4} rx={1} fill="#111" />
      <rect x={45} y={46} width={6} height={4} rx={1} fill="#111" />
      <rect x={39} y={37} width={4} height={6} rx={1} fill="#111" />
      <rect x={53} y={37} width={4} height={6} rx={1} fill="#111" />
      {/* Center pin */}
      <circle cx={48} cy={40} r={3} fill="#333" stroke="#444" strokeWidth={0.5} />

      {/* Label area on canister body */}
      <rect x={18} y={18} width={60} height={8} rx={1} fill={color} opacity={0.9} />
      {/* Brand text on label */}
      <text
        x={48}
        y={24.5}
        textAnchor="middle"
        fontSize={5.5}
        fontWeight="bold"
        fill="white"
        fontFamily="system-ui, sans-serif"
        letterSpacing={0.5}
      >
        {brand.toUpperCase().slice(0, 12)}
      </text>

      {/* ISO badge */}
      {iso && (
        <g>
          <rect x={18} y={56} width={20} height={7} rx={1} fill="#f5f0e8" opacity={0.95} />
          <text
            x={28}
            y={61.5}
            textAnchor="middle"
            fontSize={4.5}
            fontWeight="bold"
            fill="#1a1a1a"
            fontFamily="system-ui, sans-serif"
          >
            {iso}
          </text>
        </g>
      )}

      {/* Frame counter / exposure progress bar */}
      <rect x={42} y={56} width={36} height={7} rx={1} fill="#1a1a1a" opacity={0.6} />
      <rect
        x={43}
        y={57.5}
        width={34 * progress}
        height={4}
        rx={0.5}
        fill={color}
        opacity={0.8}
      />
      <text
        x={60}
        y={61}
        textAnchor="middle"
        fontSize={3.5}
        fill="white"
        fontFamily="system-ui, sans-serif"
        opacity={0.9}
      >
        {photoCount}/{frameCount}
      </text>

      {/* Light seal felt strips */}
      <rect x={78} y={36} width={2} height={8} fill="#1a1612" opacity={0.7} />

      {/* Subtle canister highlight for 3D effect */}
      <rect x={18} y={12} width={2} height={56} rx={1} fill="white" opacity={0.05} />
      <rect x={76} y={12} width={1} height={56} rx={0.5} fill="black" opacity={0.2} />
    </svg>
  )
}
