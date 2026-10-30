/**
 * Intérprete de los procedimientos guiados.
 *
 * Un paso no trae código: trae datos (condiciones, chips, textos con
 * marcadores) con el vocabulario cerrado de `procedimientos/catalogo.py` del
 * backend. Acá se evalúan contra la telemetría del controlador y el contexto
 * de la pantalla. Nada se ejecuta con `eval`.
 *
 * La seguridad no depende de esto: el controlador rechaza cualquier comando
 * fuera de orden. Esto solo decide qué se tilda y cuándo se puede avanzar.
 */

import type { TelemetriaControlador } from '../api/control'
import { fmt } from '../components/Meters'
import type { EnsayoActual } from '../context/SystemContext'
import type { Condicion, Indicador, Programa, Tono } from '../mock/types'

export interface ContextoPaso {
  t: TelemetriaControlador
  programa: Programa | null
  ensayo: EnsayoActual | null
}

export type Fuentes = Record<string, unknown>

/** Aplana la telemetría y el contexto a `{ "actuadores.laser": true, ... }`. */
export function fuentesDe({ t, programa, ensayo }: ContextoPaso): Fuentes {
  const f: Fuentes = { estado: t.estado }
  const grupos = {
    condiciones: t.condiciones,
    variables: t.variables,
    senales: t.senales,
    actuadores: t.actuadores,
    extra: t.extra,
  }
  for (const [grupo, valores] of Object.entries(grupos)) {
    for (const [clave, valor] of Object.entries(valores ?? {})) f[`${grupo}.${clave}`] = valor
  }
  const ej = t.ejecucion
  f['ejecucion.activa'] = Boolean(ej)
  if (ej) {
    f['ejecucion.modo'] = ej.modo
    f['ejecucion.pulso'] = ej.pulso
    f['ejecucion.pulsos'] = ej.pulsos
    f['ejecucion.progreso'] = ej.progreso
    f['ejecucion.distancia_mm'] = ej.distancia_mm
  }
  f['programa.seleccionado'] = Boolean(programa)
  f['programa.tiene_criterio_fin'] = Boolean(programa?.criterioFin)
  if (programa) {
    f['programa.nombre'] = programa.nombre
    f['programa.distancia_mm'] = programa.distanciaMm
    f['programa.pulsos'] = programa.pulsosEstimados
  }
  f['ensayo.lanzado'] = Boolean(ensayo)
  f['ensayo.terminado'] = Boolean(ensayo?.resultado)
  f['ensayo.completado'] = ensayo?.resultado?.estado === 'Completado'
  if (ensayo) {
    f['ensayo.modo'] = ensayo.modo
    f['ensayo.registro'] = ensayo.registro
    if (ensayo.resultado) f['ensayo.estado'] = ensayo.resultado.estado.toUpperCase()
  }
  return f
}

/** Evalúa una condición. Una fuente sin dato nunca cumple una comparación. */
export function evaluar(c: Condicion, f: Fuentes): boolean {
  if ('todas' in c) return c.todas.every((x) => evaluar(x, f))
  if ('alguna' in c) return c.alguna.some((x) => evaluar(x, f))
  const v = f[c.fuente]
  switch (c.op) {
    case 'es_verdadero':
      return v === true
    case 'es_falso':
      return v === false
    case '==':
      return v !== undefined && v === c.valor
    case '!=':
      return v !== undefined && v !== c.valor
  }
  if (typeof v !== 'number' || typeof c.valor !== 'number') return false
  switch (c.op) {
    case '>':
      return v > c.valor
    case '>=':
      return v >= c.valor
    case '<':
      return v < c.valor
    case '<=':
      return v <= c.valor
  }
  return false
}

const MARCADOR = /\{([^{}:]+)(?::(\d))?\}/g

/** Reemplaza `{fuente}` y `{fuente:decimales}` por su valor. */
export function textoCon(texto: string, f: Fuentes): string {
  return texto.replace(MARCADOR, (_, fuente: string, decimales?: string) => {
    const v = f[fuente]
    if (v === undefined || v === null) return '—'
    if (typeof v === 'number') {
      if (decimales !== undefined) return fmt(v, Number(decimales))
      return Number.isInteger(v) ? String(v) : fmt(v)
    }
    return String(v)
  })
}

/** El estado del chip: el primero cuya condición se cumple. */
export function estadoDe(ind: Indicador, f: Fuentes): { texto: string; tono: Tono } {
  const e = ind.estados.find((x) => !x.cuando || evaluar(x.cuando, f))
  return e ? { texto: textoCon(e.texto, f), tono: e.tono } : { texto: '—', tono: 'neutral' }
}

/** Describe una condición en castellano, para el editor. */
export function describir(c: Condicion | null): string {
  if (!c) return '—'
  if ('todas' in c) return c.todas.map(describir).join(' y ')
  if ('alguna' in c) return `(${c.alguna.map(describir).join(' o ')})`
  if (c.op === 'es_verdadero') return c.fuente
  if (c.op === 'es_falso') return `no ${c.fuente}`
  return `${c.fuente} ${c.op} ${c.valor}`
}
