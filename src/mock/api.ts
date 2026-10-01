import { ALERTAS, AUDITORIA, ENSAYOS, PROGRAMAS, UMBRALES, USUARIOS } from './data'
import type { Alerta, Ensayo, FiltrosEnsayo, Programa } from './types'

const LATENCY_MS = 180

function wait<T>(data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), LATENCY_MS))
}

/**
 * Capa simulada. Cuando exista backend, reemplazar el cuerpo de cada
 * función por `fetch('/api/...')` manteniendo la misma firma.
 */
export const api = {
  listarEnsayos: async (filtros?: Partial<FiltrosEnsayo>): Promise<Ensayo[]> => {
    let rows = [...ENSAYOS]
    if (filtros?.programa && filtros.programa !== 'Todos') {
      rows = rows.filter((r) => r.programa === filtros.programa)
    }
    if (filtros?.estado && filtros.estado !== 'Todos') {
      rows = rows.filter((r) => r.estado === filtros.estado)
    }
    if (filtros?.resultado && filtros.resultado !== 'Todos') {
      rows = rows.filter((r) => r.resultado === filtros.resultado)
    }
    if (filtros?.operador && filtros.operador !== 'Todos') {
      rows = rows.filter((r) => r.operador === filtros.operador)
    }
    if (filtros?.busqueda) {
      const q = filtros.busqueda.toLowerCase()
      rows = rows.filter(
        (r) => r.id.toLowerCase().includes(q) || r.notas.toLowerCase().includes(q),
      )
    }
    return wait(rows)
  },

  listarProgramas: () => wait(PROGRAMAS),
  obtenerPrograma: (id: string) => wait(PROGRAMAS.find((p) => p.id === id) as Programa),

  crearPrograma: (datos: Omit<Programa, 'id' | 'actualizado' | 'creadoPor'>, creadoPor: string): Promise<Programa> => {
    const nuevo: Programa = {
      ...datos,
      id: `PRG-${String(PROGRAMAS.length + 1).padStart(3, '0')}`,
      creadoPor,
      actualizado: new Date().toISOString().slice(0, 10),
    }
    PROGRAMAS.push(nuevo)
    return wait(nuevo)
  },

  actualizarPrograma: (
    id: string,
    datos: Omit<Programa, 'id' | 'actualizado' | 'creadoPor'>,
  ): Promise<Programa> => {
    const idx = PROGRAMAS.findIndex((p) => p.id === id)
    const actualizado: Programa = {
      ...PROGRAMAS[idx],
      ...datos,
      actualizado: new Date().toISOString().slice(0, 10),
    }
    PROGRAMAS[idx] = actualizado
    return wait(actualizado)
  },

  eliminarPrograma: (id: string): Promise<Programa[]> => {
    const idx = PROGRAMAS.findIndex((p) => p.id === id)
    if (idx !== -1) PROGRAMAS.splice(idx, 1)
    return wait(PROGRAMAS)
  },

  listarAlertas: () => wait(ALERTAS),
  listarUsuarios: () => wait(USUARIOS),
  listarAuditoria: () => wait(AUDITORIA),
  listarUmbrales: () => wait(UMBRALES),

  exportarEnsayosCsv: (rows: Ensayo[]) => {
    const header = 'ID,Fecha,Programa,Operador,Estado,Resultado,Duración,Notas'
    const body = rows
      .map((r) =>
        [r.id, r.fecha, r.programa, r.operador, r.estado, r.resultado, r.duracion, r.notas].join(','),
      )
      .join('\n')
    return `${header}\n${body}`
  },

  reconocerAlerta: async (id: string): Promise<Alerta[]> => {
    const next = ALERTAS.map((a) => (a.id === id ? { ...a, reconocida: true } : a))
    return wait(next)
  },
}
