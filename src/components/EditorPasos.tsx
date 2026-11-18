import type { DriverInfo, TipoArgumento } from '../api/hardware'
import type { ComponenteConfig, NodoPaso } from '../mock/types'
import { FormularioComando } from './FormularioComando'

/** Niveles de bloque que admite el back (`PROFUNDIDAD_MAXIMA` de `controller.programa`). */
export const PROFUNDIDAD_MAXIMA = 3
export const REPETICIONES_MAXIMAS = 10_000

export type TipoNodo = NodoPaso['tipo']

interface Props {
  pasos: NodoPaso[]
  /** Componentes del inventario; solo se ofrecen los `Vigente`. */
  componentes: Record<string, ComponenteConfig>
  /** Fichas de los drivers, por tipo de componente. */
  catalogo: Record<string, DriverInfo>
  onChange: (pasos: NodoPaso[]) => void
}

const ETIQUETA_TIPO: Record<TipoNodo, string> = {
  ACCION: 'Acción', ESPERA: 'Espera', BUCLE: 'Bucle', PARALELO: 'En paralelo',
}

/** Argumentos en blanco para un comando: los booleanos arrancan en falso, los números sin valor. */
export function argumentosVacios(fichas: Record<string, TipoArgumento>): Record<string, number | boolean> {
  return Object.fromEntries(Object.entries(fichas).filter(([, t]) => t === 'booleano').map(([k]) => [k, false]))
}

const vigentes = (componentes: Record<string, ComponenteConfig>) =>
  Object.entries(componentes).filter(([, c]) => c.estado === 'Vigente').map(([n]) => n)

const comandosDe = (componente: ComponenteConfig | undefined, catalogo: Record<string, DriverInfo>) =>
  (componente && catalogo[componente.tipo]?.operaciones) || {}

/** Nodo nuevo de cada tipo; una acción arranca con el primer componente vigente y su primer comando. */
export function nodoNuevo(
  tipo: TipoNodo, componentes: Record<string, ComponenteConfig>, catalogo: Record<string, DriverInfo>,
): NodoPaso {
  if (tipo === 'ESPERA') return { tipo, duracion_ms: 1000 }
  if (tipo === 'BUCLE') return { tipo, repeticiones: 1, pasos: [] }
  if (tipo === 'PARALELO') return { tipo, pasos: [] }
  const nombre = vigentes(componentes)[0] ?? ''
  const fichas = comandosDe(componentes[nombre], catalogo)
  const comando = Object.keys(fichas)[0] ?? ''
  return { tipo, componente: nombre, comando, argumentos: argumentosVacios(fichas[comando] ?? {}) }
}

/** Tipos de nodo que se pueden agregar en una lista: `profundidad` es el nivel de la lista (1 = raíz). */
export function tiposPermitidos(profundidad: number, enParalelo: boolean): TipoNodo[] {
  if (enParalelo || profundidad > PROFUNDIDAD_MAXIMA) return ['ACCION', 'ESPERA']
  return ['ACCION', 'ESPERA', 'BUCLE', 'PARALELO']
}

/** Intercambia el paso `i` con el vecino (`-1` sube, `1` baja); sin cambios si no hay vecino. */
export function moverPaso(pasos: NodoPaso[], i: number, sentido: -1 | 1): NodoPaso[] {
  const j = i + sentido
  if (j < 0 || j >= pasos.length) return pasos
  const copia = [...pasos]
  const otro = copia[j]
  copia[j] = copia[i]
  copia[i] = otro
  return copia
}

export const borrarPaso = (pasos: NodoPaso[], i: number): NodoPaso[] => pasos.filter((_, k) => k !== i)

interface ListaProps extends Omit<Props, 'pasos'> {
  pasos: NodoPaso[]
  profundidad: number
  enParalelo: boolean
  prefijo: string
}

function Lista({ pasos, componentes, catalogo, onChange, profundidad, enParalelo, prefijo }: ListaProps) {
  const cambiar = (i: number, nodo: NodoPaso) => onChange(pasos.map((p, k) => (k === i ? nodo : p)))
  const nombres = vigentes(componentes)
  return <div style={{ display: 'grid', gap: 8 }}>
    {pasos.map((nodo, i) => {
      const numero = `${prefijo}${i + 1}`
      return <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b className="mono">{numero}</b>
          <span>{ETIQUETA_TIPO[nodo.tipo]}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button type="button" className="ghost" aria-label={`Subir paso ${numero}`} disabled={i === 0}
              onClick={() => onChange(moverPaso(pasos, i, -1))}>↑</button>
            <button type="button" className="ghost" aria-label={`Bajar paso ${numero}`} disabled={i === pasos.length - 1}
              onClick={() => onChange(moverPaso(pasos, i, 1))}>↓</button>
            <button type="button" className="ghost" aria-label={`Borrar paso ${numero}`}
              onClick={() => onChange(borrarPaso(pasos, i))}>Borrar</button>
          </span>
        </div>
        {nodo.tipo === 'ACCION' && (() => {
          const fichas = comandosDe(componentes[nodo.componente], catalogo)
          return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <div className="field">
              <label>Componente</label>
              <select value={nodo.componente} onChange={e => {
                const f = comandosDe(componentes[e.target.value], catalogo)
                const comando = Object.keys(f)[0] ?? ''
                cambiar(i, { ...nodo, componente: e.target.value, comando, argumentos: argumentosVacios(f[comando] ?? {}) })
              }}>
                {!nombres.includes(nodo.componente) && <option value={nodo.componente}>{nodo.componente || 'Elegir…'}</option>}
                {nombres.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Comando</label>
              <select value={nodo.comando} onChange={e => cambiar(i, {
                ...nodo, comando: e.target.value, argumentos: argumentosVacios(fichas[e.target.value] ?? {}),
              })}>
                {!(nodo.comando in fichas) && <option value={nodo.comando}>{nodo.comando || 'Elegir…'}</option>}
                {Object.keys(fichas).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(fichas[nodo.comando] && Object.keys(fichas[nodo.comando]).length > 0) && (
              <FormularioComando key={`${nodo.componente}.${nodo.comando}`} argumentos={fichas[nodo.comando]}
                valoresIniciales={nodo.argumentos}
                onChange={argumentos => cambiar(i, { ...nodo, argumentos })} />
            )}
          </div>
        })()}
        {nodo.tipo === 'ESPERA' && <div className="field" style={{ marginTop: 8 }}>
          <label>Duración (ms)</label>
          <input type="number" min={1} step={1} value={Number.isFinite(nodo.duracion_ms) ? nodo.duracion_ms : ''}
            onChange={e => cambiar(i, { ...nodo, duracion_ms: e.target.value === '' ? NaN : Number(e.target.value) })} />
        </div>}
        {nodo.tipo === 'BUCLE' && <div className="field" style={{ marginTop: 8 }}>
          <label>Repeticiones (1 a {REPETICIONES_MAXIMAS})</label>
          <input type="number" min={1} max={REPETICIONES_MAXIMAS} step={1}
            value={Number.isFinite(nodo.repeticiones) ? nodo.repeticiones : ''}
            onChange={e => cambiar(i, { ...nodo, repeticiones: e.target.value === '' ? NaN : Number(e.target.value) })} />
        </div>}
        {(nodo.tipo === 'BUCLE' || nodo.tipo === 'PARALELO') && <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
          <Lista pasos={nodo.pasos} componentes={componentes} catalogo={catalogo} profundidad={profundidad + 1}
            enParalelo={nodo.tipo === 'PARALELO'} prefijo={`${numero}.`}
            onChange={hijos => cambiar(i, { ...nodo, pasos: hijos })} />
        </div>}
      </div>
    })}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {tiposPermitidos(profundidad, enParalelo).map(tipo =>
        <button key={tipo} type="button" className="ghost"
          disabled={tipo === 'ACCION' && nombres.length === 0}
          onClick={() => onChange([...pasos, nodoNuevo(tipo, componentes, catalogo)])}>
          + {ETIQUETA_TIPO[tipo]}
        </button>)}
    </div>
  </div>
}

/** Editor del árbol de pasos de un programa: acciones, esperas, bucles y bloques en paralelo. */
export function EditorPasos({ pasos, componentes, catalogo, onChange }: Props) {
  return <Lista pasos={pasos} componentes={componentes} catalogo={catalogo} onChange={onChange}
    profundidad={1} enParalelo={false} prefijo="" />
}
