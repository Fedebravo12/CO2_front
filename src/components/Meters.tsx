export function Gauge({
  value,
  min,
  max,
  color,
}: {
  value: number
  min: number
  max: number
  color: string
}) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
  const r = 42
  const c = Math.PI * r
  const dash = c * pct
  return (
    <svg className="gauge" viewBox="0 0 120 70">
      <path
        d="M18 62 A42 42 0 0 1 102 62"
        fill="none"
        stroke="#0e1620"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M18 62 A42 42 0 0 1 102 62"
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
      />
    </svg>
  )
}

export function LinearBar({
  value,
  min,
  max,
  color,
}: {
  value: number
  min: number
  max: number
  color: string
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100))
  return (
    <div className="bar">
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function fmt(n: number, digits = 2) {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}
