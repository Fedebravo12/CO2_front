import type { ComponenteConfig } from '../mock/types'
import { pedir } from './http'

export interface DriverInfo {
  pines: string[]
  parametros: Record<string, unknown>
  operaciones: Record<string, Record<string, string>>
  ayuda?: string
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
  comando: (componente: string, operacion: string, argumentos: Record<string, number>, revision: string) =>
    pedir<{ id: string; estado: string }>('/hardware/comandos/', {
      method: 'POST', body: JSON.stringify({ componente, operacion, argumentos, revision }),
    }),
}
