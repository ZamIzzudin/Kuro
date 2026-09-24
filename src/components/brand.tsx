import { cn } from '@/lib/utils'

// Logo Kuro (kara.svg) — glyph dirender inline agar warna mengikuti `currentColor`.
// viewBox sudah dirapikan ke bounding box glyph + sedikit padding.
const KARA_PATHS = [
  'M2340 3834 c-271 -50 -395 -96 -589 -221 -113 -73 -288 -249 -365 -367 -150 -229 -226 -479 -226 -746 0 -314 98 -592 295 -840 85 -107 79 -110 104 52 12 79 26 168 31 198 5 30 14 89 20 130 6 41 15 98 20 125 5 28 23 138 40 245 16 107 39 251 50 320 11 69 23 145 26 170 3 25 11 74 19 110 7 36 16 91 20 123 5 45 10 57 24 57 18 0 160 -22 260 -40 30 -6 65 -10 77 -10 12 0 34 -4 47 -9 l24 -9 -18 -119 c-18 -116 -31 -196 -50 -323 -15 -97 -25 -155 -43 -264 -9 -54 -16 -105 -14 -113 2 -10 29 6 84 49 86 66 396 304 519 398 102 78 138 106 237 183 l86 67 74 -11 c239 -35 388 -62 388 -69 0 -8 -24 -29 -135 -115 -50 -38 -97 -75 -105 -82 -8 -7 -76 -60 -150 -118 -121 -95 -400 -314 -454 -357 l-21 -16 27 -54 c15 -29 42 -78 59 -108 18 -30 48 -84 67 -120 19 -36 43 -76 52 -90 9 -14 19 -29 21 -35 4 -9 102 -187 124 -223 6 -9 38 -67 72 -128 78 -142 86 -154 97 -154 11 0 152 89 192 121 16 13 75 69 131 126 249 248 383 574 383 933 0 362 -136 688 -394 946 -192 192 -409 311 -676 369 -73 16 -374 29 -430 19z',
  'M2141 1867 l-135 -102 -17 -95 c-9 -52 -26 -156 -38 -230 -12 -74 -27 -137 -32 -141 -17 -10 161 -79 266 -104 150 -35 365 -45 496 -24 61 11 68 14 57 28 -7 9 -19 27 -27 41 -8 14 -39 68 -69 120 -30 52 -62 109 -72 125 -51 86 -118 201 -139 238 -61 109 -146 247 -151 247 -3 0 -65 -47 -139 -103z',
]

/** Logo glyph Kuro — mengikuti warna teks (`currentColor`). */
export function KaraGlyph({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="110.61 110.21 278.78 280.18"
      fill="currentColor"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <g transform="translate(0.000000,500.000000) scale(0.100000,-0.100000)">
        {KARA_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  )
}

export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center text-brand-1', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <KaraGlyph size={size} />
    </span>
  )
}

export function Brand({
  size = 34,
  subtitle,
  compact,
  className,
}: {
  size?: number
  subtitle?: string
  compact?: boolean
  className?: string
}) {
  if (compact) {
    return (
      <div className={cn('flex justify-center', className)}>
        <BrandMark size={size} />
      </div>
    )
  }
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      <div className="leading-tight">
        <div className="font-heading font-extrabold" style={{ fontSize: Math.round(size * 0.46) }}>
          Kuro
        </div>
        {subtitle && <div className="text-[11px] text-ink-400">{subtitle}</div>}
      </div>
    </div>
  )
}
