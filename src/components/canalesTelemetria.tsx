import { useEffect, useState } from 'react'
import { Aperture, CircleCheck, Droplets, Gauge, MoveHorizontal, OctagonAlert, Sun, Target, Thermometer, Timer, TriangleAlert, Zap } from 'lucide-react'
import type { TelemetriaControlador as Sample } from '../api/control'
import { api } from '../api/client'
import type { Umbral } from '../mock/types'
import { fmt } from './Meters'
import { numeroONulo, progresoEjecucion } from './ProgresoEjecucion'

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
export type Channel = { id: string; title: string; unit: string; digits: number; icon: typeof Sun; value: (s: Sample) => number; parameter?: string; factor?: number; badge?: (s: Sample) => [string, Tone]
  /** Datos del controlador que alimentan la tarjeta. Con hardware GPIO llegan en null si
   *  ningún componente tiene el rol correspondiente (ver `controller/roles.py`). */
  fuentes?: (s: Sample) => unknown[] }
/** Un dato numérico ausente (null con GPIO) se trata como NaN, que se muestra «—». */
const num = (v: unknown) => numeroONulo(v) ?? NaN
// El shutter tiene dos datos: armado/desarmado (badge) y abierto/cerrado (valor).
export const shutter = (s: Sample) => s.actuadores.shutter_abierto ? 'Abierto' : 'Cerrado'
export const channels: Channel[] = [
  // La potencia no tiene rol propio con GPIO: el estado sale del componente con rol LASER.
  { id: 'pot', title: 'POTENCIA LÁSER', unit: 'W', digits: 2, icon: Sun, parameter: 'POTENCIA_LASER', value: s => num(s.variables.POTENCIA_LASER), badge: s => s.actuadores.laser ? ['Encendido', 'activo'] : ['Apagado', 'normal'], fuentes: s => [s.variables.POTENCIA_LASER, s.actuadores.laser] },
  // Sin un pulso medido no hay tiempo de pulso: NaN se muestra como «—».
  { id: 'pulso', title: 'TIEMPO DE PULSO', unit: 'ms', digits: 0, icon: Timer, value: s => numeroONulo(s.ejecucion?.ultimo_pulso_ms) ?? NaN },
  { id: 'shutter', title: 'SHUTTER', unit: '', digits: 0, icon: Aperture, value: () => 0, badge: s => s.actuadores.shutter_armado ? ['Armado', 'activo'] : ['Desarmado', 'normal'], fuentes: s => [s.actuadores.shutter_armado, s.actuadores.shutter_abierto] },
  { id: 'hv', title: 'ALTA TENSIÓN', unit: 'kV', digits: 1, icon: Zap, parameter: 'TENSION_AT', value: s => num(s.variables.TENSION_AT), badge: s => s.condiciones.AT_ENCENDIDA ? ['Activa', 'activo'] : ['Apagada', 'normal'], fuentes: s => [s.variables.TENSION_AT] },
  { id: 'sombra', title: 'SENSOR DE SOMBRA', unit: 'mW', digits: 2, icon: Target, value: s => num(s.extra.sensor_sombra_mw), badge: s => s.condiciones.FIBRA_ALINEADA ? ['Alineada', 'ok'] : ['No alineada', 'warn'], fuentes: s => [s.extra.sensor_sombra_mw] },
  { id: 'temp', title: 'TEMP. REFRIGERACIÓN', unit: '°C', digits: 1, icon: Thermometer, parameter: 'TEMPERATURA_AGUA', value: s => num(s.variables.TEMPERATURA_AGUA), badge: s => s.condiciones.REFRIGERACION_OK ? ['Estable', 'ok'] : s.actuadores.refrigeracion ? ['Estabilizando', 'warn'] : ['Apagada', 'normal'], fuentes: s => [s.variables.TEMPERATURA_AGUA] },
  { id: 'caudal', title: 'CAUDAL REFRIGERANTE', unit: 'L/min', digits: 2, icon: Droplets, parameter: 'CAUDAL_REFRIGERANTE', value: s => num(s.variables.CAUDAL_REFRIGERANTE), fuentes: s => [s.variables.CAUDAL_REFRIGERANTE] },
  { id: 'pos', title: 'POSICIÓN DESPLAZADOR', unit: 'µm', digits: 0, icon: MoveHorizontal, parameter: 'POSICION_MOTOR', factor: 1000, value: s => num(s.variables.POSICION_MOTOR) * 1000, badge: s => s.ejecucion ? ['En curso', 'activo'] : ['Detenido', 'normal'], fuentes: s => [s.variables.POSICION_MOTOR] },
  { id: 'prog', title: 'PROGRESO DEL PROCESO', unit: '%', digits: 0, icon: Gauge, value: s => (progresoEjecucion(s.ejecucion) ?? 0) * 100 },
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
  // Con GPIO, una tarjeta sin componente que la alimente no está «apagada» ni «no alineada»:
  // no hay dato. Se muestra neutra y lo dice, sin inventar un estado (ISA-101).
  const sinComponente = !!(live && last?.modo_hal === 'gpio' && c.fuentes?.(last).every(v => v === null || v === undefined))
  if (sinComponente) return { limites: [] as number[], crudo: NaN, fuera: false, valor: '—', tono: 'normal' as Tone, badge: ['Sin asignar', 'normal'] as [string, Tone], color: 'var(--dim)', sinComponente }
  const limites = umbrales.filter(u => c.parameter && u.variable === c.parameter).flatMap(u => [u.min, u.max]).map(v => v * (c.factor ?? 1)).filter(Number.isFinite)
  const crudo = live && last ? c.value(last) : NaN
  const fuera = Number.isFinite(crudo) && limites.length > 0 && (crudo < Math.min(...limites) || crudo > Math.max(...limites))
  const valor = live && last && Number.isFinite(crudo) ? (c.id === 'shutter' ? shutter(last) : fmt(crudo, c.digits)) : '—'
  // Fuera de límite pisa al estado del equipo: es lo que el operador tiene que ver primero.
  const tono: Tone = fuera ? 'alarm' : live && last && c.badge ? c.badge(last)[1] : 'normal'
  const badge: [string, Tone] | null = fuera ? ['Fuera de límite', 'alarm'] : c.badge ? (live && last ? c.badge(last) : ['Sin datos', 'normal']) : null
  const color = !live ? 'var(--dim)' : fuera ? 'var(--red)' : 'var(--text)'
  return { limites, crudo, fuera, valor, tono, badge, color, sinComponente }
}

/** Encabezado de la tarjeta: ícono, nombre y estado con su ícono de severidad. */
export function EncabezadoCanal({ c, badge }: { c: Channel; badge: [string, Tone] | null }) {
  const Icono = badge?.[1] === 'alarm' ? OctagonAlert : badge?.[1] === 'warn' ? TriangleAlert : badge?.[1] === 'ok' ? CircleCheck : null
  return <div className="tc-heading"><span className="tc-icon"><c.icon size={19} /></span><h3 title={c.title}>{c.title}</h3>{badge && <span className={`tc-badge ${badge[1]}`}>{Icono && <Icono size={13} aria-hidden="true" />}{badge[0]}</span>}</div>
}
