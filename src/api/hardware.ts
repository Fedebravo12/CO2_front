import type { ComponenteConfig } from '../mock/types'
import { pedir } from './http'

export type TipoArgumento = 'numero' | 'entero' | 'booleano'
export type ValorArgumento = number | boolean

export interface DriverInfo {
  descripcion?: string
  pines: string[]
  parametros: Record<string, unknown>
  operaciones: Record<string, Record<string, TipoArgumento>>
  campos: Record<string, 'numero' | 'booleano'>
  contrato?: string | null
  ayuda?: string
}

// Copia de ROLES en CO2_back/controller/roles.py: mantener ambas listas sincronizadas.
export const ROLES: Record<string, { campos: string[]; clase: 'numero' | 'booleano' }> = {
  TEMPERATURA_AGUA: { campos: ['temperatura_c'], clase: 'numero' },
  CAUDAL_REFRIGERANTE: { campos: ['caudal', 'tension_v'], clase: 'numero' },
  TENSION_AT: { campos: ['tension_kv', 'tension_v'], clase: 'numero' },
  POSICION_MOTOR: { campos: ['posicion'], clase: 'numero' },
  TEMPERATURA_LASER: { campos: ['temperatura_c'], clase: 'numero' },
  SENSOR_SOMBRA: { campos: ['potencia_mw', 'tension_v'], clase: 'numero' },
  LASER: { campos: ['salida_activa'], clase: 'booleano' },
  SHUTTER: { campos: ['armado', 'salida_apertura'], clase: 'booleano' },
}

/** Roles que un driver puede cumplir según los campos de su ficha (SHUTTER exige ambos). */
export function rolesPosibles(campos: Record<string, unknown> | undefined): string[] {
  const propios = Object.keys(campos ?? {})
  return Object.entries(ROLES).filter(([nombre, r]) => nombre === 'SHUTTER'
    ? r.campos.every(c => propios.includes(c)) : r.campos.some(c => propios.includes(c))).map(([n]) => n)
}

export const esRolNumerico = (rol?: string) => !!rol && ROLES[rol]?.clase === 'numero'

export interface DatosComponente {
  tipo: string
  pines: Record<string, number | string>
  estado: ComponenteConfig['estado']
  parametros: Record<string, unknown>
  rol?: string
  ganancia?: number | string
  offset?: number | string
  inhibir_en_prueba?: boolean
}

/** Arma el componente a guardar; ganancia y offset solo viajan con un rol numérico. */
export function armarComponente(d: DatosComponente): ComponenteConfig {
  const c: ComponenteConfig = { tipo: d.tipo.trim(), pines: d.pines, estado: d.estado, parametros: d.parametros }
  if (d.rol) {
    c.rol = d.rol
    if (esRolNumerico(d.rol)) {
      // Un campo en blanco se omite: el back usa ganancia 1 y offset 0.
      for (const clave of ['ganancia', 'offset'] as const) {
        const v = d[clave]
        if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue
        const n = Number(v)
        if (!Number.isFinite(n)) throw new Error('Ganancia y offset deben ser números.')
        c[clave] = n
      }
    }
  }
  if (d.inhibir_en_prueba) c.inhibir_en_prueba = true
  return c
}
export interface ResultadoHardware {
  id: string
  componente: string
  operacion: string
  estado: string
  detalle: string | null
  ts: string
}
export interface ComponenteEstado extends ComponenteConfig {
  operaciones: DriverInfo['operaciones']
  valores?: Record<string, number | boolean | null>
  calidad?: 'OK' | 'ERROR' | 'VENCIDO'
  error?: string
  ts?: string
}
export interface HardwareEstado {
  modo_hal: 'gpio'
  revision_aplicada: string | null
  revision_deseada: string | null
  error_configuracion: string | null
  aplicando: boolean
  emergencia: boolean
  cola: number
  capacidad_cola: number
  ejecutando: string | null
  componentes: Record<string, ComponenteEstado>
  resultados: ResultadoHardware[]
  ts: string
}
export const hardwareApi = {
  catalogo: () => pedir<Record<string, DriverInfo>>('/hardware/catalogo/'),
  estado: (signal?: AbortSignal) => pedir<HardwareEstado>('/hardware/estado/', { signal }),
  aplicar: () => pedir('/hardware/aplicar/', { method: 'POST' }),
  comando: (componente: string, operacion: string, argumentos: Record<string, ValorArgumento>, revision: string) =>
    pedir<{ id: string; estado: string }>('/hardware/comandos/', {
      method: 'POST', body: JSON.stringify({ componente, operacion, argumentos, revision }),
    }),
}
