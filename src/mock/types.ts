export type Rol = 'Operador' | 'Investigador' | 'Administrador'

export type EstadoSistema =
  | 'LISTO'
  | 'PREPARACIÓN'
  | 'GRABANDO'
  | 'EMERGENCIA'

export type EstadoEnsayo = 'Completado' | 'Interrumpido' | 'Error' | 'En curso'

export type SeveridadAlerta = 'info' | 'warning' | 'critical'

export interface Telemetria {
  potenciaLaserW: number
  potenciaMw: number
  tempLaser: number
  tempRefrigeracion: number
  caudal: number
  sensorSombraMw: number
  posicionUm: number
  voltajeHv: number
  frecuenciaHz: number
  tiempoPulsoMs: number
  periodoS: number
  canalesActivos: number
  canalesTotales: number
  muestreoMs: number
  actualizacionHz: number
}

export interface Subsistema {
  id: string
  nombre: string
  estado: string
  detalle?: string
  tono: 'neutral' | 'ok' | 'info' | 'warn' | 'danger'
}

export interface Programa {
  id: string
  nombre: string
  potenciaObjetivoMw: number
  duracionPulsoMs: number
  desplazamientoUm: number
  criterioFin: string
  distanciaMm: number
  pulsosEstimados: number
  creadoPor: string
  actualizado: string
}

export interface Ensayo {
  id: string
  fecha: string
  programa: string
  operador: string
  estado: EstadoEnsayo
  resultado: string
  duracion: string
  notas: string
}

export interface Alerta {
  id: string
  fecha: string
  severidad: SeveridadAlerta
  origen: string
  mensaje: string
  reconocida: boolean
}

export interface Usuario {
  id: string
  nombre: string
  usuario: string
  rol: Rol
  activo: boolean
  ultimoAcceso: string
}

export interface Auditoria {
  id: string
  fecha: string
  usuario: string
  accion: string
  detalle: string
}

export interface Umbral {
  id: string
  parametro: string
  min: number
  max: number
  unidad: string
  critico: boolean
}

export interface ValidacionPaso {
  id: string
  label: string
  verificada: boolean
}

export interface HardwarePaso {
  id: string
  nombre: string
  estado: string
  tono: 'ok' | 'warn' | 'danger' | 'neutral' | 'info'
}

export interface PasoProcedimiento {
  id: number
  titulo: string
  subtitulo: string
  fase: number
  descripcion: string
  instrucciones: string[]
  hardware: HardwarePaso[]
  validaciones: ValidacionPaso[]
}

export interface FiltrosEnsayo {
  desde: string
  hasta: string
  programa: string
  estado: string
  resultado: string
  operador: string
  busqueda: string
}
