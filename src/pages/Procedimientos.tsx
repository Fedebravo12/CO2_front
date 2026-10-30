import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, type DatosProcedimiento } from '../api/client'
import { useSystem } from '../context/SystemContext'
import type {
  CatalogoProcedimientos,
  Condicion,
  PasoGuiado,
  ProcedimientoGuiado,
  TipoFuente,
  ValidacionPaso,
} from '../mock/types'
import { describir } from '../procedimientos/interprete'

const TIPOS_RED = ['', 'LPG', 'HLPG', 'pHLPG']

let nuevos = 0
const idNuevo = () => `nuevo-${++nuevos}`

const validacionVacia = (): ValidacionPaso => ({
  id: idNuevo(),
  orden: 0,
  texto: '',
  detalle: '',
  tipo: 'MANUAL',
  condicion: null,
})

const pasoVacio = (orden: number, fase = ''): PasoGuiado => ({
  orden,
  titulo: '',
  subtitulo: '',
  fase,
  indicadores: [],
  acciones: [],
  condicionAvance: null,
  salidas: [],
  validaciones: [validacionVacia()],
})

/** Renumera los pasos según su posición y corrige los destinos de las salidas. */
function renumerar(pasos: PasoGuiado[], mapa: Map<number, number>): PasoGuiado[] {
  return pasos.map((p, i) => ({
    ...p,
    orden: i + 1,
    salidas: p.salidas
      .filter((s) => mapa.has(s.destino))
      .map((s) => ({ ...s, destino: mapa.get(s.destino)! })),
  }))
}

function mover(pasos: PasoGuiado[], i: number, j: number): PasoGuiado[] {
  if (j < 0 || j >= pasos.length) return pasos
  const lista = [...pasos]
  const [p] = lista.splice(i, 1)
  lista.splice(j, 0, p)
  return renumerar(lista, new Map(lista.map((p, n) => [p.orden, n + 1])))
}

function quitar(pasos: PasoGuiado[], i: number): PasoGuiado[] {
  const lista = pasos.filter((_, n) => n !== i)
  return renumerar(lista, new Map(lista.map((p, n) => [p.orden, n + 1])))
}

function moverEn<T>(lista: T[], i: number, j: number): T[] {
  if (j < 0 || j >= lista.length) return lista
  const copia = [...lista]
  const [x] = copia.splice(i, 1)
  copia.splice(j, 0, x)
  return copia
}

// ── Editores chicos ─────────────────────────────────────────────────────────

/** JSON editable con validación de sintaxis; el backend valida el contenido. */
function CampoJson<T>({ valor, onChange, filas = 6 }: { valor: T; onChange: (v: T) => void; filas?: number }) {
  const [texto, setTexto] = useState(() => JSON.stringify(valor, null, 2))
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <textarea
        className="mono"
        rows={filas}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          try {
            onChange(JSON.parse(e.target.value || 'null') as T)
            setError(null)
          } catch {
            setError('JSON inválido: el cambio no se aplica hasta corregirlo.')
          }
        }}
      />
      {error && <small className="campo-error">{error}</small>}
    </>
  )
}

/** Condición simple (fuente, operador, valor). Las compuestas se editan como JSON. */
function EditorCondicion({
  valor,
  onChange,
  catalogo,
  opcional = false,
}: {
  valor: Condicion | null
  onChange: (c: Condicion | null) => void
  catalogo: CatalogoProcedimientos
  opcional?: boolean
}) {
  const compuesta = valor !== null && !('fuente' in valor)
  const [comoJson, setComoJson] = useState(compuesta)
  const tipoDe = (fuente: string): TipoFuente =>
    catalogo.fuentes.find((f) => f.fuente === fuente)?.tipo ?? 'bool'

  if (comoJson) {
    return (
      <div className="cond-editor">
        <CampoJson valor={valor} onChange={onChange} filas={5} />
        <small className="cond-desc">{describir(valor)}</small>
      </div>
    )
  }
  const hoja = valor && 'fuente' in valor ? valor : null
  const tipo = hoja ? tipoDe(hoja.fuente) : 'bool'
  const cambiarFuente = (fuente: string) => {
    if (!fuente) return onChange(null)
    const t = tipoDe(fuente)
    const op = catalogo.operadores[t][0]
    onChange(t === 'bool' ? { fuente, op } : { fuente, op, valor: t === 'num' ? 0 : '' })
  }
  return (
    <div className="cond-editor">
      <div className="cond-fila">
        <select value={hoja?.fuente ?? ''} onChange={(e) => cambiarFuente(e.target.value)}>
          <option value="">{opcional ? 'Sin condición' : 'Elegí qué se mide…'}</option>
          {catalogo.fuentes.map((f) => (
            <option key={f.fuente} value={f.fuente}>
              {f.descripcion} ({f.fuente})
            </option>
          ))}
        </select>
        {hoja && (
          <select
            value={hoja.op}
            onChange={(e) => {
              const op = e.target.value
              onChange(op.startsWith('es_') ? { fuente: hoja.fuente, op } : { ...hoja, op })
            }}
          >
            {catalogo.operadores[tipo].map((op) => (
              <option key={op} value={op}>
                {op === 'es_verdadero' ? 'es verdadero' : op === 'es_falso' ? 'es falso' : op}
              </option>
            ))}
          </select>
        )}
        {hoja && !hoja.op.startsWith('es_') && (
          <input
            type={tipo === 'num' ? 'number' : 'text'}
            step="any"
            value={hoja.valor ?? ''}
            onChange={(e) =>
              onChange({ ...hoja, valor: tipo === 'num' ? Number(e.target.value) : e.target.value })
            }
          />
        )}
      </div>
      <button type="button" className="link-btn" onClick={() => setComoJson(true)}>
        Combinar condiciones (JSON)
      </button>
    </div>
  )
}

// ── Editor del procedimiento ────────────────────────────────────────────────

function EditorProcedimiento({
  inicial,
  catalogo,
  onCancelar,
  onGuardar,
}: {
  inicial: DatosProcedimiento
  catalogo: CatalogoProcedimientos
  onCancelar: () => void
  onGuardar: (d: DatosProcedimiento) => Promise<void>
}) {
  const [datos, setDatos] = useState(inicial)
  const [abierto, setAbierto] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fases = useMemo(() => [...new Set(datos.pasos.map((p) => p.fase).filter(Boolean))], [datos.pasos])

  const setPasos = (f: (p: PasoGuiado[]) => PasoGuiado[]) => setDatos((d) => ({ ...d, pasos: f(d.pasos) }))
  const setPaso = (i: number, cambios: Partial<PasoGuiado>) =>
    setPasos((ps) => ps.map((p, n) => (n === i ? { ...p, ...cambios } : p)))
  const setValidacion = (i: number, j: number, cambios: Partial<ValidacionPaso>) =>
    setPaso(i, {
      validaciones: datos.pasos[i].validaciones.map((v, n) => (n === j ? { ...v, ...cambios } : v)),
    })

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(datos)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="panel editor-proc">
      <div className="panel-head">
        <h3>{inicial.nombre ? `EDITAR · ${inicial.nombre}` : 'NUEVO PROCEDIMIENTO'}</h3>
      </div>

      <div className="modal-body cols-2" style={{ padding: 0 }}>
        <div className="field full">
          <label>Nombre</label>
          <input
            value={datos.nombre}
            onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
            placeholder="Ej: Fabricación de PHLPG por arco eléctrico"
          />
        </div>
        <div className="field">
          <label>Tipo de red</label>
          <select value={datos.tipoRed} onChange={(e) => setDatos({ ...datos, tipoRed: e.target.value })}>
            {TIPOS_RED.map((t) => (
              <option key={t} value={t}>
                {t || 'Cualquiera'}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label>Descripción (opcional)</label>
          <input value={datos.descripcion} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} />
        </div>
      </div>

      <datalist id="fases-proc">
        {fases.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <h4 className="editor-sub">PASOS</h4>
      {datos.pasos.map((paso, i) => (
        <div key={i} className={`paso-editor ${abierto === i ? 'abierto' : ''}`}>
          <div className="paso-editor-head">
            <button type="button" className="paso-editor-titulo" onClick={() => setAbierto(abierto === i ? -1 : i)} aria-expanded={abierto === i}>
              <span className="step-num">{paso.orden}</span>
              <span>
                {paso.titulo || <em>Sin título</em>}
                <small>
                  {paso.fase || 'sin fase'} · {paso.validaciones.length} validaciones
                  {paso.salidas.length > 0 && ` · ${paso.salidas.length} bifurcaciones`}
                </small>
              </span>
            </button>
            <button type="button" className="icon-btn" aria-label="Subir paso" disabled={i === 0} onClick={() => { setPasos((ps) => mover(ps, i, i - 1)); setAbierto(i - 1) }}>
              <ArrowUp size={14} />
            </button>
            <button type="button" className="icon-btn" aria-label="Bajar paso" disabled={i === datos.pasos.length - 1} onClick={() => { setPasos((ps) => mover(ps, i, i + 1)); setAbierto(i + 1) }}>
              <ArrowDown size={14} />
            </button>
            <button type="button" className="icon-btn" aria-label="Quitar paso" disabled={datos.pasos.length === 1} onClick={() => setPasos((ps) => quitar(ps, i))}>
              <Trash2 size={14} />
            </button>
          </div>

          {abierto === i && (
            <div className="paso-editor-body">
              <div className="modal-body cols-2" style={{ padding: 0 }}>
                <div className="field">
                  <label>Título</label>
                  <input value={paso.titulo} onChange={(e) => setPaso(i, { titulo: e.target.value })} placeholder="Ej: Colocación de la fibra" />
                </div>
                <div className="field">
                  <label>Fase (agrupa pasos en el indicador superior)</label>
                  <input list="fases-proc" value={paso.fase} onChange={(e) => setPaso(i, { fase: e.target.value })} placeholder="Ej: Preparación" />
                </div>
                <div className="field full">
                  <label>Subtítulo (opcional)</label>
                  <input value={paso.subtitulo} onChange={(e) => setPaso(i, { subtitulo: e.target.value })} />
                </div>
              </div>

              <h5>Validaciones</h5>
              {paso.validaciones.map((v, j) => (
                <div key={v.id} className="valid-editor">
                  <div className="valid-editor-fila">
                    <input
                      className="valid-editor-texto"
                      value={v.texto}
                      onChange={(e) => setValidacion(i, j, { texto: e.target.value })}
                      placeholder="Qué tiene que quedar verificado"
                      aria-label={`Texto de la validación ${j + 1}`}
                    />
                    <select
                      value={v.tipo}
                      aria-label="Quién la confirma"
                      onChange={(e) => {
                        const tipo = e.target.value as ValidacionPaso['tipo']
                        setValidacion(i, j, { tipo, condicion: tipo === 'MANUAL' ? null : v.condicion })
                      }}
                    >
                      <option value="MANUAL">La tilda el operador</option>
                      <option value="SENSOR">La confirma un sensor</option>
                    </select>
                    <button type="button" className="icon-btn" aria-label="Subir validación" disabled={j === 0} onClick={() => setPaso(i, { validaciones: moverEn(paso.validaciones, j, j - 1) })}>
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Bajar validación" disabled={j === paso.validaciones.length - 1} onClick={() => setPaso(i, { validaciones: moverEn(paso.validaciones, j, j + 1) })}>
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Quitar validación" disabled={paso.validaciones.length === 1} onClick={() => setPaso(i, { validaciones: paso.validaciones.filter((_, n) => n !== j) })}>
                      <X size={14} />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={v.detalle}
                    onChange={(e) => setValidacion(i, j, { detalle: e.target.value })}
                    placeholder="Cómo se hace (lo ve el operador si despliega «¿Cómo?»)"
                    aria-label={`Detalle de la validación ${j + 1}`}
                  />
                  {v.tipo === 'SENSOR' && (
                    <EditorCondicion valor={v.condicion} catalogo={catalogo} onChange={(c) => setValidacion(i, j, { condicion: c })} />
                  )}
                </div>
              ))}
              <button type="button" className="ghost" onClick={() => setPaso(i, { validaciones: [...paso.validaciones, validacionVacia()] })}>
                <Plus size={14} /> Agregar validación
              </button>

              <h5>Al terminar el paso</h5>
              {paso.salidas.length === 0 && (
                <p className="editor-ayuda">
                  {i === datos.pasos.length - 1 ? 'Finaliza el procedimiento.' : `Sigue al paso ${paso.orden + 1}.`} Agregá bifurcaciones si el operador tiene que elegir a dónde ir (por ejemplo «Fabricar otra → Paso 6»).
                </p>
              )}
              {paso.salidas.map((s, j) => (
                <div key={j} className="valid-editor-fila">
                  <input
                    className="valid-editor-texto"
                    value={s.etiqueta}
                    placeholder="Ej: Fabricar otra PHLPG"
                    aria-label={`Etiqueta de la bifurcación ${j + 1}`}
                    onChange={(e) => setPaso(i, { salidas: paso.salidas.map((x, n) => (n === j ? { ...x, etiqueta: e.target.value } : x)) })}
                  />
                  <select
                    value={s.destino}
                    aria-label="Paso de destino"
                    onChange={(e) => setPaso(i, { salidas: paso.salidas.map((x, n) => (n === j ? { ...x, destino: Number(e.target.value) } : x)) })}
                  >
                    {datos.pasos.map((p) => (
                      <option key={p.orden} value={p.orden}>
                        → Paso {p.orden}: {p.titulo || 'sin título'}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="icon-btn" aria-label="Quitar bifurcación" onClick={() => setPaso(i, { salidas: paso.salidas.filter((_, n) => n !== j) })}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost"
                onClick={() => setPaso(i, { salidas: [...paso.salidas, { etiqueta: '', destino: Math.min(paso.orden + 1, datos.pasos.length) }] })}
              >
                <Plus size={14} /> Agregar bifurcación
              </button>

              <details className="editor-avanzado">
                <summary>Equipo: comandos, condición de avance e indicadores</summary>
                <h5>Botones de comando</h5>
                {paso.acciones.map((a, j) => (
                  <div key={j} className="valid-editor-fila">
                    <select
                      value={a.accion}
                      aria-label="Comando"
                      onChange={(e) => {
                        const accion = e.target.value
                        const etiqueta = catalogo.acciones.find((x) => x.accion === accion)?.etiqueta ?? accion
                        setPaso(i, { acciones: paso.acciones.map((x, n) => (n === j ? { accion, etiqueta } : x)) })
                      }}
                    >
                      {catalogo.acciones.map((x) => (
                        <option key={x.accion} value={x.accion}>
                          {x.accion}
                        </option>
                      ))}
                    </select>
                    <input
                      className="valid-editor-texto"
                      value={a.etiqueta}
                      aria-label="Texto del botón"
                      onChange={(e) => setPaso(i, { acciones: paso.acciones.map((x, n) => (n === j ? { ...x, etiqueta: e.target.value } : x)) })}
                    />
                    <button type="button" className="icon-btn" aria-label="Quitar comando" onClick={() => setPaso(i, { acciones: paso.acciones.filter((_, n) => n !== j) })}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setPaso(i, { acciones: [...paso.acciones, { ...catalogo.acciones[0] }] })}
                >
                  <Plus size={14} /> Agregar comando
                </button>

                <h5>Condición de avance (además de las validaciones)</h5>
                <EditorCondicion opcional valor={paso.condicionAvance} catalogo={catalogo} onChange={(c) => setPaso(i, { condicionAvance: c })} />

                <h5>Indicadores de equipo (chips)</h5>
                <p className="editor-ayuda">
                  {'Lista de {"nombre", "estados": [{"cuando", "texto", "tono"}]}. Gana el primer estado que se cumple; el texto admite {fuente} o {fuente:decimales}.'}
                </p>
                <CampoJson key={`ind-${i}-${paso.orden}`} valor={paso.indicadores} onChange={(v) => setPaso(i, { indicadores: v ?? [] })} filas={8} />
              </details>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => {
          setPasos((ps) => [...ps, pasoVacio(ps.length + 1, ps[ps.length - 1]?.fase)])
          setAbierto(datos.pasos.length)
        }}
      >
        <Plus size={14} /> Agregar paso
      </button>

      {error && <p className="login-error" style={{ margin: '12px 0 0' }}>{error}</p>}
      <div className="modal-actions">
        <button className="ghost" type="button" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="primary" type="button" disabled={!datos.nombre.trim() || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar procedimiento'}
        </button>
      </div>
    </section>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────

export function Procedimientos() {
  const { rol, recargarProgramas } = useSystem()
  const canEdit = rol === 'Administrador' || rol === 'Investigador'
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState<ProcedimientoGuiado[]>([])
  const [catalogo, setCatalogo] = useState<CatalogoProcedimientos | null>(null)
  const [editando, setEditando] = useState<{ id: string | null; datos: DatosProcedimiento } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProcedimientoGuiado | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selId = params.get('id')
  const sel = lista.find((p) => p.id === selId) ?? lista[0] ?? null
  const seleccionar = (id: string) => setParams({ id }, { replace: true })

  const recargar = async () => setLista(await api.listarProcedimientos())

  useEffect(() => {
    recargar().catch((e: Error) => setError(e.message))
    api.catalogoProcedimientos().then(setCatalogo).catch(() => setCatalogo(null))
  }, [])

  const guardar = async (datos: DatosProcedimiento) => {
    const guardado = editando?.id
      ? await api.actualizarProcedimiento(editando.id, datos)
      : await api.crearProcedimiento(datos)
    await recargar()
    // Los programas muestran el nombre y la versión de su procedimiento.
    await recargarProgramas()
    seleccionar(guardado.id)
    setEditando(null)
  }

  const duplicar = async (p: ProcedimientoGuiado) => {
    setError(null)
    try {
      const copia = await api.duplicarProcedimiento(p.id)
      await recargar()
      seleccionar(copia.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const eliminar = async () => {
    if (!confirmDelete) return
    setError(null)
    try {
      await api.eliminarProcedimiento(confirmDelete.id)
      await recargar()
      setParams({}, { replace: true })
    } catch (e) {
      setError((e as Error).message)
    }
    setConfirmDelete(null)
  }

  if (editando && catalogo) {
    return (
      <>
        <h1 className="page-title">Procedimientos guiados</h1>
        <EditorProcedimiento inicial={editando.datos} catalogo={catalogo} onCancelar={() => setEditando(null)} onGuardar={guardar} />
      </>
    )
  }

  return (
    <>
      <h1 className="page-title">Procedimientos guiados</h1>
      {error && <p className="login-error" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="cards-2">
        <section className="panel">
          <div className="panel-head">
            <h3>BIBLIOTECA</h3>
            {canEdit && (
              <button
                className="primary"
                type="button"
                disabled={!catalogo}
                onClick={() => setEditando({ id: null, datos: { nombre: '', descripcion: '', tipoRed: '', pasos: [pasoVacio(1)] } })}
              >
                <Plus size={16} /> Nuevo procedimiento
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CÓDIGO</th>
                  <th>NOMBRE</th>
                  <th>PASOS</th>
                  <th>PROGRAMAS</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className={sel?.id === p.id ? 'sel' : ''} onClick={() => seleccionar(p.id)}>
                    <td className="mono">{p.id}</td>
                    <td>
                      {p.nombre} <small style={{ color: 'var(--dim)' }}>v{p.version}</small>
                    </td>
                    <td className="mono">{p.pasos.length}</td>
                    <td>{p.programas.map((x) => x.nombre).join(', ') || '—'}</td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--muted)' }}>
                      No hay procedimientos cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="editor-ayuda" style={{ marginTop: 12 }}>
            Cada programa de grabado usa un procedimiento: se asigna desde «Programas de grabado».
          </p>
        </section>

        {sel && (
          <section className="panel">
            <div className="panel-head">
              <h3>DETALLE · {sel.nombre}</h3>
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="ghost" type="button" disabled={!catalogo} onClick={() => setEditando({ id: sel.id, datos: structuredClone(sel) })}>
                    <Pencil size={16} /> Editar
                  </button>
                  <button className="ghost" type="button" onClick={() => duplicar(sel)}>
                    <Copy size={16} /> Duplicar
                  </button>
                  <button className="ghost" type="button" onClick={() => setConfirmDelete(sel)}>
                    <Trash2 size={16} /> Eliminar
                  </button>
                </div>
              )}
            </div>
            <p className="editor-ayuda">
              {sel.id} · v{sel.version} · {sel.tipoRed || 'cualquier red'} · actualizado {sel.actualizado} por {sel.creadoPor}
            </p>
            {sel.descripcion && <p>{sel.descripcion}</p>}
            <ol className="proc-vista">
              {sel.pasos.map((p) => (
                <li key={p.orden}>
                  <b>
                    {p.orden}. {p.titulo}
                  </b>{' '}
                  <small>{p.fase}</small>
                  <ul>
                    {p.validaciones.map((v) => (
                      <li key={v.id}>
                        {v.texto}
                        {v.tipo === 'SENSOR' && <em> · sensor: {describir(v.condicion)}</em>}
                        {v.detalle && <div className="proc-vista-detalle">{v.detalle}</div>}
                      </li>
                    ))}
                  </ul>
                  {p.salidas.length > 0 && (
                    <p className="proc-vista-salidas">
                      {p.salidas.map((s) => `${s.etiqueta} → Paso ${s.destino}`).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-bg" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Eliminar procedimiento</h3>
            <p>
              ¿Seguro que querés eliminar <b>{confirmDelete.nombre}</b>? Si algún programa lo usa, primero
              hay que asignarle otro.
            </p>
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="primary" type="button" style={{ background: '#c31220', borderColor: '#ff4d5a' }} onClick={eliminar}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
