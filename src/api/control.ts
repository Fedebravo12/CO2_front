/**
 * Control del arreglo de grabado.
 *
 * Los comandos van por la API REST (que los valida y los audita) y el
 * controlador los ejecuta. El resultado no vuelve en la respuesta HTTP: se ve
 * en la telemetría, que llega por WebSocket (ver useTelemetriaControlador).
 */

import type { EstadoSistema, Telemetria } from '../mock/types'
import { ErrorApi, pedir } from './http'

export type EstadoControlador = 'REPOSO' | 'PREPARANDO' | 'LISTO' | 'GRABANDO' | 'EMERGENCIA'

export type Condicion = 'REFRIGERACION_OK' | 'AT_ENCENDIDA' | 'FIBRA_ALINEADA' | 'SHUTTER_ARMADO'

export type Accion =
  | 'encender_refrigeracion'
  | 'apagar_refrigeracion'
  | 'habilitar_at'
  | 'deshabilitar_at'
  | 'alinear_fibra'
  | 'armar_shutter'
  | 'desarmar_shutter'
  | 'encender_laser'
  | 'apagar_laser'
  | 'mover_motor'
  | 'abortar'
  | 'apagar'
  | 'emergencia'
  | 'rearmar'
  | 'inyectar_falla'

export type Falla = 'ninguna' | 'sobretemperatura' | 'caudal'

/** Mensaje de telemetría tal como lo publica el controlador. */
export interface TelemetriaControlador {
  ts: string
  estado: EstadoControlador
  condiciones: Record<Condicion, boolean>
  variables: {
    TEMPERATURA_AGUA: number
    CAUDAL_REFRIGERANTE: number
    POTENCIA_LASER: number
    TENSION_AT: number
    CORRIENTE_AT: number
    POSICION_MOTOR: number
    TEMPERATURA_AMBIENTE: number
  }
  senales: { FIBRA_ALINEADA: boolean; SHUTTER_ABIERTO: boolean; SHUTTER_CERRADO: boolean }
  actuadores: {
    refrigeracion: boolean
    alta_tension: boolean
    laser: boolean
    lazo_cerrado: boolean
    shutter_armado: boolean
    shutter_abierto: boolean
    alineando: boolean
  }
  extra: {
    potencia_optica_mw: number
    sensor_sombra_mw: number
    temperatura_laser: number
    frecuencia_hz: number
  }
  ejecucion: {
    registro: string
    programa: string
    modo: 'REAL' | 'PRUEBA'
    pulso: number
    pulsos: number
    progreso: number
    distancia_mm: number
  } | null
  falla: Falla
  bloqueado: boolean
  mensaje: { texto: string; nivel: 'info' | 'warn' | 'error'; ts: string } | null
  hz: number
}

const ESTADO_FRONT: Record<EstadoControlador, EstadoSistema> = {
  REPOSO: 'REPOSO',
  PREPARANDO: 'PREPARACIÓN',
  LISTO: 'LISTO',
  GRABANDO: 'GRABANDO',
  EMERGENCIA: 'EMERGENCIA',
}

export function estadoFront(t: TelemetriaControlador | null, vivo: boolean): EstadoSistema {
  if (!t || !vivo) return 'SIN CONEXIÓN'
  return ESTADO_FRONT[t.estado]
}

/** Traduce la telemetría del controlador al tipo que usan las pantallas. */
export function aTelemetria(t: TelemetriaControlador, base: Telemetria): Telemetria {
  const v = t.variables
  const frecuencia = t.extra.frecuencia_hz
  return {
    ...base,
    potenciaLaserW: v.POTENCIA_LASER,
    potenciaMw: t.extra.potencia_optica_mw,
    tempLaser: t.extra.temperatura_laser,
    tempRefrigeracion: v.TEMPERATURA_AGUA,
    caudal: v.CAUDAL_REFRIGERANTE,
    sensorSombraMw: t.extra.sensor_sombra_mw,
    posicionUm: v.POSICION_MOTOR * 1000,
    voltajeHv: v.TENSION_AT * 1000,
    frecuenciaHz: frecuencia,
    periodoS: frecuencia > 0 ? 1 / frecuencia : 0,
    canalesActivos: Object.keys(v).length + Object.keys(t.senales).length,
    canalesTotales: 10,
    muestreoMs: Math.round(1000 / (t.hz || 1)),
    actualizacionHz: t.hz,
  }
}

export const control = {
  /** Última telemetría, o `null` si el controlador no está publicando. */
  estado: async (): Promise<TelemetriaControlador | null> => {
    try {
      return await pedir<TelemetriaControlador>('/control/estado/')
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 503) return null
      throw e
    }
  },

  comando: (accion: Accion, extra: Record<string, unknown> = {}) =>
    pedir<{ accion: string; encolado: boolean }>('/control/comandos/', {
      method: 'POST',
      body: JSON.stringify({ accion, ...extra }),
    }),

  /** Crea el registro del ensayo y manda el programa al controlador. */
  iniciar: (programa: string, modo: 'REAL' | 'PRUEBA' = 'REAL') =>
    pedir<{ registro: string; red: string | null; programa: string; modo: string }>('/control/iniciar/', {
      method: 'POST',
      body: JSON.stringify({ programa, modo }),
    }),
}
