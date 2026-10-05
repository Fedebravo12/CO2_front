import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Crosshair, Download, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { fmt } from './Meters'

interface Punto { wl: number; db: number }
interface CurvaChartProps { csv: string; color?: string; height?: number }

function parseCsv(csv: string): Punto[] {
  const lines = csv.split(/\r?\n/)
  const start = lines.findIndex(line => line.includes('[TRACE DATA]'))
  return lines.slice(start >= 0 ? start + 1 : 0).flatMap(line => {
    const cells = line.trim().split(',')
    if (cells.length < 2 || !cells[0].trim() || !cells[1].trim()) return []
    const [wl, db] = cells.map(Number)
    return Number.isFinite(wl) && Number.isFinite(db) ? [{ wl, db }] : []
  }).sort((a, b) => a.wl - b.wl)
}

function ticks(min: number, max: number, count: number) {
  const raw = (max - min) / count
  const base = 10 ** Math.floor(Math.log10(raw || 1))
  const ratio = raw / base
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * base
  const values: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * .001; v += step) values.push(Number(v.toPrecision(12)))
  return values
}

export function CurvaChart({ csv, color = '#2ad4c4', height = 390 }: CurvaChartProps) {
  const puntos = useMemo(() => parseCsv(csv), [csv])
  const host = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const id = useId().replace(/:/g, '')
  const [width, setWidth] = useState(900)
  const [ventana, setVentana] = useState<[number, number] | null>(null)
  const [cursor, setCursor] = useState<Punto | null>(null)
  const [seleccion, setSeleccion] = useState<[number, number] | null>(null)
  const inicio = useRef<number | null>(null)
  useEffect(() => { setVentana(null); setCursor(null); setSeleccion(null) }, [csv])
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [puntos.length > 0])

  const minimo = useMemo(() => puntos.reduce<Punto | null>((a, p) => !a || p.db < a.db ? p : a, null), [puntos])
  if (!puntos.length || !minimo) return <div className="chart-empty"><Crosshair size={30} /><h3>Sin espectro disponible</h3><p>La curva aparece cuando el ensayo tiene una medición óptica registrada.</p></div>

  const fullMin = puntos[0].wl
  const fullMax = puntos[puntos.length - 1].wl
  const [wlMin, wlMax] = ventana ?? [fullMin, fullMax === fullMin ? fullMin + 1 : fullMax]
  const span = wlMax - wlMin || 1
  const visibles = puntos.filter(p => p.wl >= wlMin && p.wl <= wlMax)
  const pathPoints = puntos.filter((p, i) => p.wl >= wlMin && p.wl <= wlMax || p.wl < wlMin && puntos[i + 1]?.wl >= wlMin || p.wl > wlMax && puntos[i - 1]?.wl <= wlMax)
  const valores = visibles.length ? visibles : puntos
  let low = Infinity, high = -Infinity
  for (const p of valores) { low = Math.min(low, p.db); high = Math.max(high, p.db) }
  const margen = Math.max((high - low) * .12, .5)
  const dbMin = Math.floor(low - margen)
  const dbMax = Math.ceil(high + margen)
  const h = width < 500 ? 300 : height
  const pad = { top: 36, right: 26, bottom: 60, left: 64 }
  const iw = width - pad.left - pad.right, ih = h - pad.top - pad.bottom
  const x = (wl: number) => pad.left + (wl - wlMin) / span * iw
  const y = (db: number) => pad.top + (dbMax - db) / (dbMax - dbMin || 1) * ih
  const path = pathPoints.map((p, i) => `${i ? 'L' : 'M'}${x(p.wl).toFixed(2)},${y(p.db).toFixed(2)}`).join(' ')
  const clamp = (n: number) => Math.max(wlMin, Math.min(wlMax, n))
  const position = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return clamp(wlMin + ((e.clientX - rect.left) * width / rect.width - pad.left) / iw * span)
  }
  const nearest = (wl: number) => puntos.reduce((a, p) => Math.abs(p.wl - wl) < Math.abs(a.wl - wl) ? p : a)
  const zoom = (factor: number, center = (wlMin + wlMax) / 2) => {
    const size = Math.min(fullMax - fullMin || 1, Math.max(span * factor, (fullMax - fullMin) / 500, .01))
    const left = Math.max(fullMin, Math.min(fullMax - size, center - size / 2))
    setVentana(size >= fullMax - fullMin ? null : [left, left + size])
    setCursor(null)
  }
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const exportSvg = () => {
    if (!svg.current) return
    const clone = svg.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(width)); clone.setAttribute('height', String(h))
    clone.querySelectorAll('[data-interaction]').forEach(node => node.remove())
    download(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }), 'espectro.svg')
  }

  return (
    <div className="spectrum-chart" ref={host}>
      <div className="spectrum-heading"><div><span className="chart-eyebrow">CARACTERIZACIÓN ÓPTICA</span><h2>Espectro de transmisión</h2><p>Longitud de onda y transmitancia de la red grabada</p></div><span className="chart-series"><i style={{ background: color }} />Medición registrada</span></div>
      <div className="spectrum-stats"><div><span>Mínimo medido</span><b>{fmt(minimo.wl, 2)} <small>nm</small></b></div><div><span>Transmitancia mínima</span><b>{fmt(minimo.db, 2)} <small>dB</small></b></div><div><span>Ventana visible</span><b>{fmt(wlMin, 0)}–{fmt(wlMax, 0)} <small>nm</small></b></div><div><span>Muestras</span><b>{puntos.length.toLocaleString('es-AR')}</b></div></div>
      <div className="chart-toolbar"><div><button className="ghost" aria-label="Acercar curva" onClick={() => zoom(.5)}><ZoomIn size={15} /></button><button className="ghost" aria-label="Alejar curva" disabled={!ventana} onClick={() => zoom(2)}><ZoomOut size={15} /></button><button className="ghost" onClick={() => zoom(.15, minimo.wl)}><Crosshair size={15} />Ver mínimo</button><button className="ghost" disabled={!ventana} onClick={() => { setVentana(null); setCursor(null) }}><RotateCcw size={14} />Restablecer</button></div><div><button className="ghost" onClick={() => download(new Blob(['longitud_onda_nm,transmitancia_db\n' + puntos.map(p => `${p.wl},${p.db}`).join('\n')], { type: 'text/csv;charset=utf-8' }), 'espectro.csv')}><Download size={14} />CSV</button><button className="ghost" onClick={exportSvg}><Download size={14} />SVG</button></div></div>
      <svg ref={svg} className="spectrum-svg" fontFamily="monospace" viewBox={`0 0 ${width} ${h}`} role="img" aria-label="Curva de transmisión. Arrastrar para ampliar un intervalo. Usar flechas para recorrer las muestras." tabIndex={0}
        onPointerDown={e => { if (e.button !== 0) return; inicio.current = position(e); setSeleccion([inicio.current, inicio.current]); e.currentTarget.setPointerCapture(e.pointerId) }}
        onPointerMove={e => { const wl = position(e); setCursor(nearest(wl)); if (inicio.current !== null) setSeleccion([inicio.current, wl]) }}
        onPointerUp={e => { if (inicio.current !== null) { const end = position(e); if (Math.abs(end - inicio.current) / span > .015) setVentana([Math.min(end, inicio.current), Math.max(end, inicio.current)]); } inicio.current = null; setSeleccion(null); setCursor(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }}
        onPointerCancel={() => { inicio.current = null; setSeleccion(null) }} onPointerLeave={() => { if (inicio.current === null) setCursor(null) }}
        onKeyDown={e => { if (e.key === 'Escape') { setVentana(null); setCursor(null) } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const index = cursor ? visibles.indexOf(cursor) : -1; setCursor(visibles[Math.max(0, Math.min(visibles.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)))] ?? null) } }}>
        <title>Espectro de transmisión de la red</title><desc>Longitud de onda en nanómetros y transmitancia en decibelios. Mínimo medido en {minimo.wl} nm, {minimo.db} dB.</desc>
        <defs><clipPath id={`${id}-clip`}><rect x={pad.left} y={pad.top} width={iw} height={ih} /></clipPath><linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".13" /><stop offset="1" stopColor={color} stopOpacity=".01" /></linearGradient></defs>
        <rect width={width} height={h} fill="#0c141d" rx="10" />
        {ticks(dbMin, dbMax, 5).map(v => <g key={v}><line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke="#243342" strokeDasharray="3 5" /><text x={pad.left - 12} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#a2b3c4">{fmt(v, Math.abs(dbMax - dbMin) < 3 ? 1 : 0)}</text></g>)}
        {ticks(wlMin, wlMax, width < 500 ? 3 : 7).map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1={pad.top} y2={h - pad.bottom} stroke="#1c2a37" /><text x={x(v)} y={h - pad.bottom + 22} textAnchor="middle" fontSize="12" fill="#a2b3c4">{fmt(v, span < 10 ? 1 : 0)}</text></g>)}
        <text x={pad.left} y="19" fontSize="11" fill="#a2b3c4">Transmitancia (dB)</text><text x={pad.left + iw / 2} y={h - 12} textAnchor="middle" fontSize="12" fill="#a2b3c4">Longitud de onda (nm)</text>
        <g clipPath={`url(#${id}-clip)`}><path d={`${path} L${x(pathPoints[pathPoints.length - 1]?.wl ?? wlMax)},${h - pad.bottom} L${x(pathPoints[0]?.wl ?? wlMin)},${h - pad.bottom} Z`} fill={`url(#${id}-area)`} /><path className="spectrum-trace" d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          {minimo.wl >= wlMin && minimo.wl <= wlMax && <g><line x1={x(minimo.wl)} x2={x(minimo.wl)} y1={pad.top} y2={h - pad.bottom} stroke="#f5c542" strokeOpacity=".5" strokeDasharray="4 5" /><circle cx={x(minimo.wl)} cy={y(minimo.db)} r="5" fill="#f5c542" stroke="#0c141d" strokeWidth="2" /></g>}
          {seleccion && <rect data-interaction x={x(Math.min(...seleccion))} y={pad.top} width={Math.abs(x(seleccion[1]) - x(seleccion[0]))} height={ih} fill={color} fillOpacity=".16" stroke={color} />}
          {cursor && <g data-interaction><line x1={x(cursor.wl)} x2={x(cursor.wl)} y1={pad.top} y2={h - pad.bottom} stroke="#e3edf5" strokeOpacity=".6" strokeDasharray="3 3" /><line x1={pad.left} x2={width - pad.right} y1={y(cursor.db)} y2={y(cursor.db)} stroke="#e3edf5" strokeOpacity=".3" strokeDasharray="3 3" /><circle cx={x(cursor.wl)} cy={y(cursor.db)} r="4" fill={color} stroke="#ffffff" strokeWidth="1.5" /></g>}
        </g>
      </svg>
      <div className="chart-footer"><span>{cursor ? <><b>{fmt(cursor.wl, 2)} nm</b><i />{fmt(cursor.db, 3)} dB</> : <><span className="chart-min-dot" />Mínimo medido: {fmt(minimo.wl, 2)} nm · {fmt(minimo.db, 2)} dB</>}</span><small>Pasá el cursor para medir · arrastrá para ampliar</small></div>
    </div>
  )
}
