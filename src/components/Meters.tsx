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
  const point = (fraction: number, r: number) => {
    const angle = Math.PI * (1 - fraction)
    return { x: 90 + Math.cos(angle) * r, y: 87 - Math.sin(angle) * r }
  }
  const needle = point(pct, 48)
  return (
    <svg className="gauge" viewBox="0 0 180 106" role="meter" aria-label="Indicador de medición" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}>
      {Array.from({ length: 21 }, (_, i) => {
        const p1 = point(i / 20, i % 5 === 0 ? 70 : 73)
        const p2 = point(i / 20, 77)
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={i / 20 <= pct ? color : '#405364'} strokeWidth={i % 5 === 0 ? 1.5 : 1} />
      })}
      <path
        d="M28 87 A62 62 0 0 1 152 87"
        fill="none"
        stroke="#243341"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M28 87 A62 62 0 0 1 152 87"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray={`${pct * 100} 100`}
      />
      <line x1="90" y1="87" x2={needle.x} y2={needle.y} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="90" cy="87" r="5" fill="#14232e" stroke={color} strokeWidth="2" />
      <text x="22" y="103" textAnchor="middle" fill="#8b9aab" fontSize="9">{min}</text><text x="158" y="103" textAnchor="middle" fill="#8b9aab" fontSize="9">{max}</text>
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
    <div className="bar" role="meter" aria-label="Nivel de medición" aria-valuemin={min ?? 0} aria-valuemax={max ?? 100} aria-valuenow={value}>
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
