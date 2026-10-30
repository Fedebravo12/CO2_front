export type Rol = 'Operador' | 'Investigador' | 'Administrador'

// Estados del controlador (REPOSO, PREPARACIÓN, LISTO, GRABANDO, EMERGENCIA), más
// SIN CONEXIÓN: cuando la telemetría deja de llegar, el front no muestra el
// último estado conocido como si fuera actual.
export type EstadoSistema =
  | 'REPOSO'
  | 'PREPARACIÓN'
  | 'LISTO'
  | 'GRABANDO'
  | 'EMERGENCIA'
  | 'SIN CONEXIÓN'

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

export type PerfilPeriodo = 'CONSTANTE' | 'LINEAL' | 'EXPONENCIAL'

export interface Programa {
  id: string
  nombre: string
  version: number
  potenciaObjetivoMw: number
  duracionPulsoMs: number
  perfilPeriodo: PerfilPeriodo
  desplazamientoUm: number
  incrementoUm: number | null
  factor: number | null
  criterioFin: string
  distanciaMm: number
  pulsosEstimados: number
  creadoPor: string
  actualizado: string
  /** Código del procedimiento guiado que se sigue con este programa. */
  procedimiento: string | null
  procedimientoNombre: string
}

export interface Ensayo {
  id: string
  lote: string
  codigoLpg: string
  fecha: string
  programa: string
  operador: string
  estado: EstadoEnsayo
  resultado: string
  duracion: string
  notas: string
  periodoRed?: string
  iSld?: string
  tensionReferencia?: string
  escalaVerticalOsa?: string
  span?: string
  sensibilidad?: string
  resolucion?: string
  cantidadMarcas?: string
  longitudLpg?: string
  lambda?: string
  l?: string
  lambdaSecundario?: string
  lSecundario?: string
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
  // Solo llegan al administrador (los demás roles reciben el listado reducido).
  nombreDePila?: string
  apellido?: string
  email?: string
  legajo?: string
}

export interface Auditoria {
  id: string
  fecha: string
  usuario: string
  accion: string
  detalle: string
}

export type SeveridadUmbral = 'INFO' | 'ADVERTENCIA' | 'CRITICA'
export type AccionUmbral = 'ALERTA' | 'BLOQUEAR_COMANDO' | 'PARADA_EMERGENCIA'

export interface Umbral {
  id: string
  parametro: string
  min: number
  max: number
  unidad: string
  critico: boolean
  severidad: SeveridadUmbral
  accion: AccionUmbral
  activo: boolean
}

// ── Procedimientos guiados (ver procedimientos/catalogo.py en CO2_back) ─────

export type Tono = 'ok' | 'warn' | 'danger' | 'neutral' | 'info'

/** Hoja `{fuente, op, valor}` o combinación `{todas}` (Y) / `{alguna}` (O). */
export type Condicion =
  | { fuente: string; op: string; valor?: number | string }
  | { todas: Condicion[] }
  | { alguna: Condicion[] }

export interface EstadoIndicador {
  cuando: Condicion | null
  /** Admite `{fuente}` o `{fuente:decimales}`. */
  texto: string
  tono: Tono
}

/** Chip de hardware: gana el primer estado cuya condición se cumple. */
export interface Indicador {
  nombre: string
  estados: EstadoIndicador[]
}

/** Botón que manda un comando. */
export interface BotonPaso {
  tipo?: 'boton'
  etiqueta: string
  accion: string
}

/** Un solo botón: manda `apagar` si `estado` se cumple y `encender` si no. */
export interface InterruptorPaso {
  tipo: 'interruptor'
  estado: Condicion
  encender: { etiqueta: string; accion: string }
  apagar: { etiqueta: string; accion: string }
}

export type AccionPaso = BotonPaso | InterruptorPaso

/** Bifurcación: el número de paso al que lleva. */
export interface SalidaPaso {
  etiqueta: string
  destino: number
}

export type TipoValidacion = 'MANUAL' | 'SENSOR'

export interface ValidacionPaso {
  id: string
  orden: number
  texto: string
  /** Cómo se hace. El operador lo despliega si lo necesita. */
  detalle: string
  tipo: TipoValidacion
  condicion: Condicion | null
}

export interface PasoGuiado {
  orden: number
  titulo: string
  subtitulo: string
  fase: string
  indicadores: Indicador[]
  acciones: AccionPaso[]
  condicionAvance: Condicion | null
  salidas: SalidaPaso[]
  validaciones: ValidacionPaso[]
}

export interface ProcedimientoGuiado {
  id: string
  nombre: string
  descripcion: string
  tipoRed: string
  version: number
  creadoPor: string
  actualizado: string
  programas: { codigo: string; nombre: string }[]
  pasos: PasoGuiado[]
}

export type TipoFuente = 'bool' | 'num' | 'texto'

export interface CatalogoProcedimientos {
  fuentes: { fuente: string; tipo: TipoFuente; descripcion: string }[]
  operadores: Record<TipoFuente, string[]>
  acciones: { accion: string; etiqueta: string }[]
  tonos: Tono[]
}

export interface FiltrosEnsayo {
  desde: string
  hasta: string
  lote: string
  codigoLpg: string
  programa: string
  estado: string
  resultado: string
  operador: string
  busqueda: string
}

export type EstadoComponente = 'Vigente' | 'Eliminado'

export interface ComponenteConfig {
  tipo: string
  pines: Record<string, number | string> // Mapea "Trig" -> "GPIO17"
  parametros?: Record<string, any>
  estado: EstadoComponente
}

export interface HardwareConfig {
  componentes: Record<string, ComponenteConfig>
}