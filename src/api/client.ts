/**
 * Capa de API del front contra CO2_back.
 *
 * Reemplaza a `src/mock/api.ts` manteniendo la forma de los datos que ya usan
 * las páginas (los tipos de `src/mock/types.ts`). El backend expone su propio
 * contrato —snake_case, fechas ISO, unidades en el nombre del campo—, y la
 * traducción entre los dos vive acá y solo acá: si cambia la API, se toca este
 * archivo y no las pantallas.
 *
 * Contrato completo del backend: https://localhost:8443/api/docs/
 */

import type { Alerta, Auditoria, Ensayo, FiltrosEnsayo, Programa, Rol, Umbral, Usuario } from '../mock/types'
import { ErrorApi, pedir } from './http'

// ── Tipos del backend ────────────────────────────────────────────────────────

type CodigoRol = 'OPERADOR' | 'INVESTIGADOR' | 'ADMINISTRADOR'
type EstadoEjecucion = 'EN_CURSO' | 'COMPLETADO' | 'INTERRUMPIDO' | 'ABORTADO'
export type CriterioFin = 'LONGITUD' | 'CANT_MARCAS' | 'MANUAL' | 'TIEMPO' | 'ATENUACION_OBJETIVO'

export interface UsuarioApi {
  id: number
  username: string
  nombre: string
  rol: CodigoRol | null
  activo: boolean
  ultimo_acceso: string | null
}

interface EnsayoApi {
  codigo: string
  estado: EstadoEjecucion
  modo: 'REAL' | 'PRUEBA'
  inicio: string
  fin: string | null
  duracion_s: number | null
  observaciones: string
  programa: { codigo: string; nombre: string }
  operadores: { username: string; nombre: string }[]
  red: {
    codigo: string
    lote: number
    estado: 'VIABLE' | 'INVIABLE' | 'ROTA'
    cantidad_marcas?: number
    longitud_mm?: number | null
  } | null
  // Solo en el detalle:
  periodo_um?: number | null
  procedimiento?: {
    span_nm: number
    resolucion_nm: number
    sensibilidad: string
    escala_vertical_db_div: number | null
    corriente_sld_ma: number | null
  } | null
  resonancias?: { longitud_onda_nm: number; transmitancia_db: number; principal: boolean }[]
  tiene_espectro?: boolean
}

interface ProgramaApi {
  codigo: string
  nombre: string
  potencia_objetivo_mw: number
  duracion_pulso_ms: number
  desplazamiento_um: number
  criterio_fin: CriterioFin
  distancia_mm: number
  pulsos: number
  creado_por: string
  actualizado_en: string
}

// ── Traducciones ─────────────────────────────────────────────────────────────

export const ROL_DE_CODIGO: Record<CodigoRol, Rol> = {
  OPERADOR: 'Operador',
  INVESTIGADOR: 'Investigador',
  ADMINISTRADOR: 'Administrador',
}

const ESTADO_ENSAYO: Record<EstadoEjecucion, Ensayo['estado']> = {
  EN_CURSO: 'En curso',
  COMPLETADO: 'Completado',
  INTERRUMPIDO: 'Interrumpido',
  ABORTADO: 'Error',
}

const ESTADO_API = Object.fromEntries(
  Object.entries(ESTADO_ENSAYO).map(([api, front]) => [front, api]),
) as Record<string, EstadoEjecucion>

const RESULTADO_DE_RED = { VIABLE: 'OK', INVIABLE: 'Inviable', ROTA: 'Rota' } as const

/** Criterios de fin que ofrece el formulario de programas. */
export const CRITERIOS_FIN: { valor: CriterioFin; etiqueta: string }[] = [
  { valor: 'LONGITUD', etiqueta: 'Distancia total' },
  { valor: 'CANT_MARCAS', etiqueta: 'Cantidad de pulsos' },
  { valor: 'MANUAL', etiqueta: 'Manual' },
]

const ETIQUETA_CRITERIO: Record<CriterioFin, string> = {
  LONGITUD: 'Distancia total',
  CANT_MARCAS: 'Cantidad de pulsos',
  MANUAL: 'Manual',
  TIEMPO: 'Tiempo',
  ATENUACION_OBJETIVO: 'Atenuación objetivo',
}

export function criterioDeEtiqueta(etiqueta: string): CriterioFin {
  return CRITERIOS_FIN.find((c) => c.etiqueta === etiqueta)?.valor ?? 'MANUAL'
}

function dos(n: number) {
  return String(n).padStart(2, '0')
}

/** ISO → `dd/mm/aaaa hh:mm:ss` en la hora local del navegador. */
export function fmtFecha(iso: string | null | undefined, conSegundos = true): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const fecha = `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}${conSegundos ? `:${dos(d.getSeconds())}` : ''}`
  return `${fecha} ${hora}`
}

function fmtDuracion(segundos: number | null): string {
  if (segundos == null) return '—'
  return `${dos(Math.floor(segundos / 3600))}:${dos(Math.floor((segundos % 3600) / 60))}:${dos(segundos % 60)}`
}

function conUnidad(valor: number | null | undefined, unidad: string, decimales?: number): string | undefined {
  if (valor == null) return undefined
  return `${decimales == null ? valor : valor.toFixed(decimales)} ${unidad}`
}

function aEnsayo(e: EnsayoApi): Ensayo {
  const [principal, secundaria] = e.resonancias ?? []
  const estado = ESTADO_ENSAYO[e.estado]
  return {
    id: e.codigo,
    lote: e.red ? `LOT-${String(e.red.lote).padStart(3, '0')}` : '—',
    codigoLpg: e.red?.codigo ?? '— (prueba)',
    fecha: fmtFecha(e.inicio),
    programa: e.programa.nombre,
    operador: e.operadores.map((o) => o.nombre).join(', ') || '—',
    estado,
    resultado: estado === 'Completado' && e.red ? RESULTADO_DE_RED[e.red.estado] : '—',
    duracion: fmtDuracion(e.duracion_s),
    notas: e.observaciones,
    periodoRed: conUnidad(e.periodo_um, 'µm'),
    iSld: conUnidad(e.procedimiento?.corriente_sld_ma, 'mA'),
    escalaVerticalOsa: conUnidad(e.procedimiento?.escala_vertical_db_div, 'dB/div'),
    span: conUnidad(e.procedimiento?.span_nm, 'nm'),
    sensibilidad: e.procedimiento?.sensibilidad || undefined,
    resolucion: conUnidad(e.procedimiento?.resolucion_nm, 'nm'),
    cantidadMarcas: e.red?.cantidad_marcas != null ? String(e.red.cantidad_marcas) : undefined,
    longitudLpg: conUnidad(e.red?.longitud_mm, 'mm', 2),
    lambda: conUnidad(principal?.longitud_onda_nm, 'nm', 2),
    l: conUnidad(principal?.transmitancia_db, 'dB', 2),
    lambdaSecundario: conUnidad(secundaria?.longitud_onda_nm, 'nm', 2),
    lSecundario: conUnidad(secundaria?.transmitancia_db, 'dB', 2),
  }
}

function aPrograma(p: ProgramaApi): Programa {
  return {
    id: p.codigo,
    nombre: p.nombre,
    potenciaObjetivoMw: p.potencia_objetivo_mw,
    duracionPulsoMs: p.duracion_pulso_ms,
    desplazamientoUm: p.desplazamiento_um,
    criterioFin: ETIQUETA_CRITERIO[p.criterio_fin] ?? p.criterio_fin,
    distanciaMm: p.distancia_mm,
    pulsosEstimados: p.pulsos,
    creadoPor: p.creado_por || '—',
    actualizado: fmtFecha(p.actualizado_en, false),
  }
}

type DatosPrograma = Omit<Programa, 'id' | 'actualizado' | 'creadoPor'>

function deProgramaAApi(d: DatosPrograma) {
  const criterio = criterioDeEtiqueta(d.criterioFin)
  return {
    nombre: d.nombre,
    potencia_objetivo_mw: d.potenciaObjetivoMw,
    duracion_pulso_ms: d.duracionPulsoMs,
    desplazamiento_um: d.desplazamientoUm,
    criterio_fin: criterio,
    // Según el criterio, el backend usa uno y deriva el otro.
    distancia_mm: criterio === 'CANT_MARCAS' ? null : d.distanciaMm || null,
    pulsos: criterio === 'LONGITUD' ? null : d.pulsosEstimados || null,
  }
}

function aUsuario(u: UsuarioApi): Usuario {
  return {
    id: String(u.id),
    nombre: u.nombre,
    usuario: u.username,
    rol: u.rol ? ROL_DE_CODIGO[u.rol] : 'Operador',
    activo: u.activo,
    ultimoAcceso: fmtFecha(u.ultimo_acceso, false),
  }
}

const SEVERIDAD = { INFO: 'info', ADVERTENCIA: 'warning', CRITICA: 'critical' } as const

// ── API ──────────────────────────────────────────────────────────────────────

export const api = {
  listarEnsayos: async (filtros?: Partial<FiltrosEnsayo>): Promise<Ensayo[]> => {
    // Lo que el backend sabe filtrar va en la query; el resto se filtra acá.
    const q = new URLSearchParams()
    if (filtros?.estado && filtros.estado !== 'Todos' && ESTADO_API[filtros.estado]) {
      q.set('estado', ESTADO_API[filtros.estado])
    }
    if (filtros?.operador && filtros.operador !== 'Todos') q.set('operador', filtros.operador)
    if (filtros?.desde) q.set('desde', filtros.desde)
    if (filtros?.hasta) q.set('hasta', filtros.hasta)
    if (filtros?.lote) q.set('lote', filtros.lote)
    if (filtros?.busqueda) q.set('q', filtros.busqueda)

    let rows = (await pedir<EnsayoApi[]>(`/ensayos/?${q}`)).map(aEnsayo)
    if (filtros?.programa && filtros.programa !== 'Todos') {
      rows = rows.filter((r) => r.programa === filtros.programa)
    }
    if (filtros?.resultado && filtros.resultado !== 'Todos') {
      rows = rows.filter((r) => r.resultado === filtros.resultado)
    }
    if (filtros?.codigoLpg) {
      const c = filtros.codigoLpg.toLowerCase()
      rows = rows.filter((r) => r.codigoLpg.toLowerCase().includes(c))
    }
    return rows
  },

  /** Detalle de un ensayo, o `null` si no existe. */
  obtenerEnsayo: async (id: string): Promise<Ensayo | null> => {
    try {
      return aEnsayo(await pedir<EnsayoApi>(`/ensayos/${encodeURIComponent(id)}/`))
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 404) return null
      throw e
    }
  },

  /**
   * Curva del espectro en el formato CSV que entiende `CurvaChart`
   * (sección `[TRACE DATA]` con pares `nm,dB`), o `null` si la red todavía no
   * fue caracterizada.
   */
  obtenerCurvaCsv: async (id: string): Promise<string | null> => {
    try {
      const c = await pedir<{ longitudes_onda_nm: number[]; transmitancias_db: number[] }>(
        `/ensayos/${encodeURIComponent(id)}/curva/`,
      )
      const filas = c.longitudes_onda_nm.map((nm, i) => `${nm},${c.transmitancias_db[i]}`)
      return `[TRACE DATA]\n${filas.join('\n')}`
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 404) return null
      throw e
    }
  },

  listarProgramas: async (): Promise<Programa[]> =>
    (await pedir<ProgramaApi[]>('/programas/')).map(aPrograma),

  obtenerPrograma: async (id: string): Promise<Programa> =>
    aPrograma(await pedir<ProgramaApi>(`/programas/${encodeURIComponent(id)}/`)),

  crearPrograma: async (datos: DatosPrograma): Promise<Programa> =>
    aPrograma(
      await pedir<ProgramaApi>('/programas/', {
        method: 'POST',
        body: JSON.stringify(deProgramaAApi(datos)),
      }),
    ),

  actualizarPrograma: async (id: string, datos: DatosPrograma): Promise<Programa> =>
    aPrograma(
      await pedir<ProgramaApi>(`/programas/${encodeURIComponent(id)}/`, {
        method: 'PUT',
        body: JSON.stringify(deProgramaAApi(datos)),
      }),
    ),

  /**
   * Elimina un programa y devuelve los restantes. Si ya se usó en algún
   * ensayo, el backend lo da de baja en lugar de borrarlo (trazabilidad).
   */
  eliminarPrograma: async (id: string): Promise<Programa[]> => {
    await pedir<void>(`/programas/${encodeURIComponent(id)}/`, { method: 'DELETE' })
    return api.listarProgramas()
  },

  /**
   * Alertas por umbral y paradas de emergencia, juntas y por fecha: la pantalla
   * es "Alertas / Eventos". Las ids llevan prefijo para saber de cuál vienen.
   */
  listarAlertas: async (): Promise<Alerta[]> => {
    const [alertas, emergencias] = await Promise.all([
      pedir<{
        id: number
        fecha_hora: string
        severidad: keyof typeof SEVERIDAD
        origen: string
        descripcion: string
        sugerencia: string
        reconocida: boolean
      }[]>('/alertas/'),
      pedir<{
        id: number
        fecha_hora: string
        origen_display: string
        descripcion: string
        tiempo_respuesta_ms: number
        cumple_rnf001: boolean
        rearmado_en: string | null
        rearmado_por: string | null
      }[]>('/emergencias/'),
    ])
    const filas: (Alerta & { iso: string })[] = [
      ...alertas.map((a) => ({
        id: `al-${a.id}`,
        iso: a.fecha_hora,
        fecha: fmtFecha(a.fecha_hora),
        severidad: SEVERIDAD[a.severidad],
        origen: a.origen,
        mensaje: a.sugerencia ? `${a.descripcion} ${a.sugerencia}` : a.descripcion,
        reconocida: a.reconocida,
      })),
      ...emergencias.map((e) => ({
        id: `em-${e.id}`,
        iso: e.fecha_hora,
        fecha: fmtFecha(e.fecha_hora),
        severidad: 'critical' as const,
        origen: `Parada de emergencia · ${e.origen_display}`,
        mensaje:
          `${e.descripcion} Respuesta en ${e.tiempo_respuesta_ms} ms ` +
          `(${e.cumple_rnf001 ? 'dentro' : 'FUERA'} de los 500 ms de RNF001).` +
          (e.rearmado_por ? ` Rearmado por ${e.rearmado_por}.` : ' Sin rearmar.'),
        // Una emergencia no se "reconoce": se rearma, desde el banner de la
        // barra superior. Acá figura resuelta si ya se rearmó.
        reconocida: e.rearmado_en != null,
      })),
    ]
    return filas.sort((a, b) => b.iso.localeCompare(a.iso)).map(({ iso: _iso, ...a }) => a)
  },

  reconocerAlerta: async (id: string): Promise<Alerta[]> => {
    if (id.startsWith('al-')) {
      await pedir(`/alertas/${id.slice(3)}/reconocer/`, { method: 'POST' })
    }
    return api.listarAlertas()
  },

  listarUsuarios: async (): Promise<Usuario[]> =>
    (await pedir<UsuarioApi[]>('/usuarios/')).map(aUsuario),

  /** Bitácora de auditoría. Solo el administrador: el resto recibe 403. */
  listarAuditoria: async (): Promise<Auditoria[]> =>
    (
      await pedir<{ id: number; fecha_hora: string; usuario: string; accion: string; detalle: string }[]>(
        '/auditoria/',
      )
    ).map((a) => ({
      id: String(a.id),
      fecha: fmtFecha(a.fecha_hora),
      usuario: a.usuario,
      accion: a.accion,
      detalle: a.detalle,
    })),

  listarUmbrales: async (): Promise<Umbral[]> =>
    (
      await pedir<{ id: number; parametro: string; valor_min: number; valor_max: number; unidad: string; critico: boolean }[]>(
        '/umbrales/',
      )
    ).map((u) => ({
      id: String(u.id),
      parametro: u.parametro,
      min: u.valor_min,
      max: u.valor_max,
      unidad: u.unidad,
      critico: u.critico,
    })),

  /** Exporta filas ya cargadas a CSV. No necesita al backend. */
  exportarEnsayosCsv: (rows: Ensayo[]) => {
    const header = 'ID,Fecha,Programa,Operador,Estado,Resultado,Duración,Notas'
    const celda = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const body = rows
      .map((r) =>
        [r.id, r.fecha, r.programa, r.operador, r.estado, r.resultado, r.duracion, r.notas]
          .map(celda)
          .join(','),
      )
      .join('\n')
    return `${header}\n${body}`
  },
}
