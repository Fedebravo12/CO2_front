import { useEffect, useState } from 'react'
import { Aperture, CircleCheck, Droplets, Gauge, MoveHorizontal, OctagonAlert, Sun, Target, Thermometer, Timer, TriangleAlert, Zap } from 'lucide-react'
import type { TelemetriaControlador as Sample } from '../api/control'
import { api } from '../api/client'
import type { Umbral } from '../mock/types'
import { fmt } from './Meters'

/* Canales de telemetría que comparten el dashboard y la vista previa de Nuevo ensayo.
 * Criterio ISA-101 (HMI de alto rendimiento): en operación normal la pantalla es
 * neutra y el color queda reservado para lo anormal, siempre con ícono y texto.
 *  - normal: estado esperado, gris.
 *  - ok: condición confirmada como correcta (alineada, estable). Verde sin
 *    relleno + check: queda por debajo de warn y alarm, que sí llevan relleno.
 *  - activo: equipo encendido o en marcha; borde de tarjeta verde y badge con relleno verde.
 *  - warn: condición anormal que requiere atención (amarillo + triángulo).
 *  - alarm: variable fuera de su límite configurado (rojo + octógono). */
export type Tone = 'normal' | 'ok' | 'activo' | 'warn' | 'alarm'
export type Channel = { id: string; title: string; unit: string; digits: number; icon: typeof Sun; value: (s: Sample) => number; parameter?: string; factor?: number; badge?: (s: Sample) => [string, Tone] }
// El shutter tiene dos datos: armado/desarmado (badge) y abierto/cerrado (valor).
export const shutter = (s: Sample) => s.actuadores.shutter_abierto ? 'Abierto' : 'Cerrado'
export const channels: Channel[] = [
  { id: 'pot', title: 'POTENCIA LÁSER', unit: 'W', digits: 2, icon: Sun, parameter: 'POTENCIA_LASER', value: s => s.variables.POTENCIA_LASER, badge: s => s.actuadores.laser ? ['Encendido', 'activo'] : ['Apagado', 'normal'] },
  // Sin grabado en curso no hay tiempo de pulso: NaN se muestra como «—».
  { id: 'pulso', title: 'TIEMPO DE PULSO', unit: 'ms', digits: 0, icon: Timer, value: s => s.ejecucion?.duracion_pulso_ms ?? NaN },
  { id: 'shutter', title: 'SHUTTER', unit: '', digits: 0, icon: Aperture, value: () => 0, badge: s => s.actuadores.shutter_armado ? ['Armado', 'activo'] : ['Desarmado', 'normal'] },
  { id: 'hv', title: 'ALTA TENSIÓN', unit: 'kV', digits: 1, icon: Zap, parameter: 'TENSION_AT', value: s => s.variables.TENSION_AT, badge: s => s.condiciones.AT_ENCENDIDA ? ['Activa', 'activo'] : ['Apagada', 'normal'] },
  { id: 'sombra', title: 'SENSOR DE SOMBRA', unit: 'mW', digits: 2, icon: Target, value: s => s.extra.sensor_sombra_mw, badge: s => s.condiciones.FIBRA_ALINEADA ? ['Alineada', 'ok'] : ['No alineada', 'warn'] },
  { id: 'temp', title: 'TEMP. REFRIGERACIÓN', unit: '°C', digits: 1, icon: Thermometer, parameter: 'TEMPERATURA_AGUA', value: s => s.variables.TEMPERATURA_AGUA, badge: s => s.condiciones.REFRIGERACION_OK ? ['Estable', 'ok'] : s.actuadores.refrigeracion ? ['Estabilizando', 'warn'] : ['Apagada', 'normal'] },
  { id: 'caudal', title: 'CAUDAL REFRIGERANTE', unit: 'L/min', digits: 2, icon: Droplets, parameter: 'CAUDAL_REFRIGERANTE', value: s => s.variables.CAUDAL_REFRIGERANTE },
  { id: 'pos', title: 'POSICIÓN DESPLAZADOR', unit: 'µm', digits: 0, icon: MoveHorizontal, parameter: 'POSICION_MOTOR', factor: 1000, value: s => s.variables.POSICION_MOTOR * 1000, badge: s => s.ejecucion ? ['En curso', 'activo'] : ['Detenido', 'normal'] },
  { id: 'prog', title: 'PROGRESO DEL PROCESO', unit: '%', digits: 0, icon: Gauge, value: s => (s.ejecucion?.progreso ?? 0) * 100 },
]

/** Límites activos configurados (umbrales). `onError` recibe el aviso si no se pudieron cargar. */
export function useUmbrales(onError?: (error: string | null) => void) {
  const [umbrales, setUmbrales] = useState<Umbral[]>([])
  useEffect(() => {
    let active = true
    api.listarUmbrales()
      .then(data => { if (active) { setUmbrales(data.filter(u => u.activo)); onError?.(null) } })
      .catch(() => { if (active) onError?.('No se pudieron cargar los límites configurados.') })
    return () => { active = false; onError?.(null) }
  }, [onError])
  return umbrales
}

/** Lectura de un canal con la última muestra: valor, límites y tono de la tarjeta. */
export function lecturaCanal(c: Channel, last: Sample | null, live: boolean, umbrales: Umbral[]) {
  const limites = umbrales.filter(u => c.parameter && u.variable === c.parameter).flatMap(u => [u.min, u.max]).map(v => v * (c.factor ?? 1)).filter(Number.isFinite)
  const crudo = live && last ? c.value(last) : NaN
  const fuera = Number.isFinite(crudo) && limites.length > 0 && (crudo < Math.min(...limites) || crudo > Math.max(...limites))
  const valor = live && last && Number.isFinite(crudo) ? (c.id === 'shutter' ? shutter(last) : fmt(crudo, c.digits)) : '—'
  // Fuera de límite pisa al estado del equipo: es lo que el operador tiene que ver primero.
  const tono: Tone = fuera ? 'alarm' : live && last && c.badge ? c.badge(last)[1] : 'normal'
  const badge: [string, Tone] | null = fuera ? ['Fuera de límite', 'alarm'] : c.badge ? (live && last ? c.badge(last) : ['Sin datos', 'normal']) : null
  const color = !live ? 'var(--dim)' : fuera ? 'var(--red)' : 'var(--text)'
  return { limites, crudo, fuera, valor, tono, badge, color }
}

/** Encabezado de la tarjeta: ícono, nombre y estado con su ícono de severidad. */
export function EncabezadoCanal({ c, badge }: { c: Channel; badge: [string, Tone] | null }) {
  const Icono = badge?.[1] === 'alarm' ? OctagonAlert : badge?.[1] === 'warn' ? TriangleAlert : badge?.[1] === 'ok' ? CircleCheck : null
  return <div className="tc-heading"><span className="tc-icon"><c.icon size={19} /></span><h3 title={c.title}>{c.title}</h3>{badge && <span className={`tc-badge ${badge[1]}`}>{Icono && <Icono size={13} aria-hidden="true" />}{badge[0]}</span>}</div>
}
