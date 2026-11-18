import type { TelemetriaControlador } from '../api/control'
import { fmt, LinearBar } from './Meters'

export type Ejecucion = NonNullable<TelemetriaControlador['ejecucion']>

/** El número si es un número finito; si no, null (dato ausente). */
export const numeroONulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Fracción hecha (0 a 1): acciones sobre el total. null si no se sabe; nunca NaN. */
export function progresoEjecucion(ejecucion: Ejecucion | null | undefined): number | null {
  if (!ejecucion) return null
  const acciones = numeroONulo(ejecucion.acciones)
  const total = numeroONulo(ejecucion.total)
  if (acciones === null || total === null || total <= 0) return null
  return Math.min(1, Math.max(0, acciones / total))
}

/** Línea de progreso de Nuevo ensayo: acciones/total · pulsos · ubicación · último pulso. */
export function ProgresoEjecucion({ ejecucion }: { ejecucion: Ejecucion }) {
  const acciones = numeroONulo(ejecucion.acciones)
  const total = numeroONulo(ejecucion.total)
  const pulsos = numeroONulo(ejecucion.pulsos)
  const ultimo = numeroONulo(ejecucion.ultimo_pulso_ms)
  const fraccion = progresoEjecucion(ejecucion)
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ color: 'var(--muted)', fontSize: 12 }}>
        {ejecucion.programa} · {acciones ?? '—'}/{total ?? '—'} acciones · {pulsos ?? '—'} pulsos ·{' '}
        {ejecucion.ubicacion || '—'} · último pulso {ultimo === null ? '—' : `${fmt(ultimo, 1)} ms`}
      </label>
      {fraccion === null ? (
        <div className="bar" role="meter" aria-label="Progreso del programa" aria-valuetext="Sin dato">
          <i style={{ width: '0%' }} />
        </div>
      ) : (
        <LinearBar value={fraccion * 100} min={0} max={100} color="var(--green)" />
      )}
    </div>
  )
}
