interface Punto {
  wl: number
  db: number
}

interface CurvaChartProps {
  csv: string
  color?: string
  height?: number
}

function parseCsv(csv: string): Punto[] {
  const lines = csv.split('\n')
  const dataStart = lines.findIndex((l) => l.includes('[TRACE DATA]'))
  if (dataStart === -1) return []

  const puntos: Punto[] = []
  for (let i = dataStart + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const [wlStr, dbStr] = line.split(',')
    const wl = Number(wlStr)
    const db = Number(dbStr)
    if (Number.isFinite(wl) && Number.isFinite(db)) {
      puntos.push({ wl, db })
    }
  }
  return puntos
}

export function CurvaChart({ csv, color = '#2ad4c4', height = 260 }: CurvaChartProps) {
  const puntos = parseCsv(csv)

  if (puntos.length === 0) {
    return <p style={{ color: 'var(--muted)', marginTop: 16 }}>Sin datos de curva disponibles</p>
  }

  const width = 900
  const padding = { top: 16, right: 16, bottom: 32, left: 48 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const wlMin = puntos[0].wl
  const wlMax = puntos[puntos.length - 1].wl
  const dbMin = Math.min(...puntos.map((p) => p.db))
  const dbMax = Math.max(...puntos.map((p) => p.db))
  const dbPad = (dbMax - dbMin) * 0.08 || 1

  const x = (wl: number) => padding.left + ((wl - wlMin) / (wlMax - wlMin)) * innerW
  const y = (db: number) =>
    padding.top + innerH - ((db - (dbMin - dbPad)) / (dbMax + dbPad - (dbMin - dbPad))) * innerH

  const path = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.wl).toFixed(2)} ${y(p.db).toFixed(2)}`).join(' ')

  const yTicks = 5
  const yTickVals = Array.from({ length: yTicks }, (_, i) => dbMin - dbPad + ((dbMax + dbPad - (dbMin - dbPad)) * i) / (yTicks - 1))

  const xTicks = 6
  const xTickVals = Array.from({ length: xTicks }, (_, i) => wlMin + ((wlMax - wlMin) * i) / (xTicks - 1))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {yTickVals.map((v, i) => (
        <g key={i}>
          <line x1={padding.left} x2={width - padding.right} y1={y(v)} y2={y(v)} stroke="var(--border-soft)" strokeWidth={1} />
          <text x={padding.left - 8} y={y(v)} textAnchor="end" alignmentBaseline="middle" fontSize={11} fill="var(--muted)">
            {v.toFixed(0)}
          </text>
        </g>
      ))}
      {xTickVals.map((v, i) => (
        <text key={i} x={x(v)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
          {v.toFixed(0)}
        </text>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      <text x={width / 2} y={height - padding.bottom + 28} textAnchor="middle" fontSize={11} fill="var(--dim)">
        Longitud de onda (nm)
      </text>
    </svg>
  )
}
