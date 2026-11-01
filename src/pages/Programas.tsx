import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, CRITERIOS_FIN, PERFILES_PERIODO } from '../api/client'
import type { PerfilPeriodo, ProcedimientoGuiado, Programa } from '../mock/types'
import { useSystem } from '../context/SystemContext'
import { fmt } from '../components/Meters'

const FORM_INICIAL = {
  nombre: '',
  potenciaObjetivoMw: '',
  duracionPulsoMs: '',
  perfilPeriodo: 'CONSTANTE' as PerfilPeriodo,
  desplazamientoUm: '',
  incrementoUm: '',
  factor: '',
  criterioFin: CRITERIOS_FIN[0].etiqueta,
  distanciaMm: '',
  pulsosEstimados: '',
  /** Código del procedimiento guiado; vacío = sin asignar. */
  procedimiento: '',
}

/** Período de la marca `n` (µm), igual que `Periodo.calcular_distancia` del backend. */
function periodoDeMarca(form: typeof FORM_INICIAL, n: number) {
  const base = Number(form.desplazamientoUm)
  if (form.perfilPeriodo === 'LINEAL') return base + (Number(form.incrementoUm) || 0) * n
  if (form.perfilPeriodo === 'EXPONENCIAL') return base * (Number(form.factor) || 1) ** n
  return base
}

/** Tope de marcas al derivar, el mismo que aplica el backend. */
const MAXIMO_MARCAS = 100_000

/**
 * Distancia y pulsos no son independientes: la longitud es la suma de los
 * períodos de las marcas (marcas × período si el perfil es constante). Según el
 * criterio de fin se ingresa uno y el otro se deriva, igual que hace el backend.
 * Si el perfil no permite derivar (período no positivo, sin parámetros) el campo
 * derivado queda vacío y el backend informa el motivo al guardar.
 */
function derivar(form: typeof FORM_INICIAL) {
  const despl = Number(form.desplazamientoUm)
  if (!despl) return form
  if (form.criterioFin === 'Distancia total' && form.distanciaMm) {
    const largoUm = Number(form.distanciaMm) * 1000
    if (form.perfilPeriodo === 'CONSTANTE') {
      return { ...form, pulsosEstimados: String(Math.floor(largoUm / despl)) }
    }
    let acumulado = 0
    let n = 0
    while (n < MAXIMO_MARCAS) {
      const periodo = periodoDeMarca(form, n)
      if (periodo <= 0 || acumulado + periodo > largoUm) break
      acumulado += periodo
      n++
    }
    return { ...form, pulsosEstimados: n >= MAXIMO_MARCAS ? '' : String(n) }
  }
  if (form.criterioFin === 'Cantidad de pulsos' && form.pulsosEstimados) {
    let acumulado = 0
    for (let n = 0; n < Number(form.pulsosEstimados); n++) acumulado += periodoDeMarca(form, n)
    return { ...form, distanciaMm: String(acumulado / 1000) }
  }
  return form
}

export function Programas() {
  const { rol, programas: rows, recargarProgramas } = useSystem()
  const [selId, setSelId] = useState<string | null>(null)
  const sel = rows.find((p) => p.id === selId) ?? rows[0] ?? null
  const canEdit = rol === 'Administrador' || rol === 'Investigador'
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [confirmDelete, setConfirmDelete] = useState<Programa | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [procedimientos, setProcedimientos] = useState<ProcedimientoGuiado[]>([])

  useEffect(() => {
    api.listarProcedimientos().then(setProcedimientos).catch(() => setProcedimientos([]))
  }, [])

  const setField = (campo: keyof typeof FORM_INICIAL, valor: string) =>
    setForm((f) => derivar({ ...f, [campo]: valor }))

  const distanciaDerivada = form.criterioFin === 'Cantidad de pulsos'
  const pulsosDerivados = form.criterioFin === 'Distancia total'

  const cerrarModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(FORM_INICIAL)
    setError(null)
  }

  const abrirNuevo = () => {
    setEditId(null)
    setForm(FORM_INICIAL)
    setError(null)
    setShowModal(true)
  }

  const abrirEdicion = (p: Programa) => {
    setEditId(p.id)
    setError(null)
    setForm({
      nombre: p.nombre,
      potenciaObjetivoMw: String(p.potenciaObjetivoMw),
      duracionPulsoMs: String(p.duracionPulsoMs),
      perfilPeriodo: p.perfilPeriodo,
      desplazamientoUm: String(p.desplazamientoUm),
      incrementoUm: p.incrementoUm == null ? '' : String(p.incrementoUm),
      factor: p.factor == null ? '' : String(p.factor),
      criterioFin: CRITERIOS_FIN.some((c) => c.etiqueta === p.criterioFin) ? p.criterioFin : 'Manual',
      distanciaMm: String(p.distanciaMm),
      pulsosEstimados: String(p.pulsosEstimados),
      procedimiento: p.procedimiento ?? '',
    })
    setShowModal(true)
  }

  const guardarPrograma = async () => {
    if (!form.nombre.trim()) return
    const datos = {
      nombre: form.nombre.trim(),
      potenciaObjetivoMw: Number(form.potenciaObjetivoMw) || 0,
      duracionPulsoMs: Number(form.duracionPulsoMs) || 0,
      perfilPeriodo: form.perfilPeriodo,
      desplazamientoUm: Number(form.desplazamientoUm) || 0,
      incrementoUm: form.incrementoUm === '' ? null : Number(form.incrementoUm),
      factor: form.factor === '' ? null : Number(form.factor),
      criterioFin: form.criterioFin,
      distanciaMm: Number(form.distanciaMm) || 0,
      pulsosEstimados: Number(form.pulsosEstimados) || 0,
      procedimiento: form.procedimiento || null,
    }
    setGuardando(true)
    try {
      const guardado = editId
        ? await api.actualizarPrograma(editId, datos)
        : await api.crearPrograma(datos)
      await recargarProgramas()
      setSelId(guardado.id)
      cerrarModal()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminarPrograma = async () => {
    if (!confirmDelete) return
    try {
      await api.eliminarPrograma(confirmDelete.id)
      await recargarProgramas()
      if (selId === confirmDelete.id) setSelId(null)
    } catch (e) {
      setError((e as Error).message)
    }
    setConfirmDelete(null)
  }

  return (
    <>
      <h1 className="page-title">Programas de grabado</h1>
      {error && !showModal && <p className="login-error" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="cards-2">
        <section className="panel">
          <div className="panel-head">
            <h3>BIBLIOTECA</h3>
            {canEdit && (
              <button className="primary" type="button" onClick={abrirNuevo}>
                <Plus size={16} /> Nuevo programa
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NOMBRE</th>
                  <th>POTENCIA</th>
                  <th>PULSO</th>
                  <th>ΔX</th>
                  <th>PULSOS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={sel?.id === p.id ? 'sel' : ''} onClick={() => setSelId(p.id)}>
                    <td>{p.nombre}</td>
                    <td className="mono">{fmt(p.potenciaObjetivoMw)} mW</td>
                    <td className="mono">{p.duracionPulsoMs} ms</td>
                    <td className="mono">{p.desplazamientoUm} µm</td>
                    <td className="mono">{p.pulsosEstimados}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--muted)' }}>
                      No hay programas cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {sel && (
          <section className="panel">
            <div className="panel-head">
              <h3>DETALLE · {sel.nombre}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {canEdit && (
                  <>
                    <button className="ghost" type="button" onClick={() => abrirEdicion(sel)}>
                      <Pencil size={16} /> Editar
                    </button>
                    <button className="ghost" type="button" onClick={() => setConfirmDelete(sel)}>
                      <Trash2 size={16} /> Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="kv">
              <div>
                <span>Código</span>
                <b className="mono">{sel.id}</b>
              </div>
              <div>
                <span>Potencia objetivo</span>
                <b>{fmt(sel.potenciaObjetivoMw)} mW</b>
              </div>
              <div>
                <span>Duración de pulso</span>
                <b>{sel.duracionPulsoMs} ms</b>
              </div>
              <div>
                <span>{sel.perfilPeriodo === 'CONSTANTE' ? 'Desplazamiento por pulso' : 'Período inicial'}</span>
                <b>{sel.desplazamientoUm} µm</b>
              </div>
              <div>
                <span>Perfil de período</span>
                <b>
                  {PERFILES_PERIODO.find((p) => p.valor === sel.perfilPeriodo)?.etiqueta}
                  {sel.perfilPeriodo === 'LINEAL' && ` · +${sel.incrementoUm} µm/marca`}
                  {sel.perfilPeriodo === 'EXPONENCIAL' && ` · ×${sel.factor}/marca`}
                </b>
              </div>
              <div>
                <span>Versión</span>
                <b>v{sel.version}</b>
              </div>
              <div>
                <span>Criterio de finalización</span>
                <b>{sel.criterioFin}</b>
              </div>
              <div>
                <span>Distancia total</span>
                <b>{fmt(sel.distanciaMm)} mm</b>
              </div>
              <div>
                <span>Pulsos estimados</span>
                <b>{sel.pulsosEstimados}</b>
              </div>
              <div>
                <span>Procedimiento guiado</span>
                <b>
                  {sel.procedimiento ? (
                    <Link to={`/procedimientos?id=${encodeURIComponent(sel.procedimiento)}`}>
                      {sel.procedimientoNombre}
                    </Link>
                  ) : (
                    'Sin asignar'
                  )}
                </b>
              </div>
              <div>
                <span>Última actualización</span>
                <b>{sel.actualizado}</b>
              </div>
              <div>
                <span>Creado por</span>
                <b>{sel.creadoPor}</b>
              </div>
            </div>
          </section>
        )}
      </div>

      {showModal && (
        <div className="modal-bg" onClick={cerrarModal}>
          <div className="modal" style={{ width: 'min(620px, calc(100% - 32px))' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--text)' }}>{editId ? 'Editar programa' : 'Nuevo programa'}</h3>
              <button className="modal-close" type="button" onClick={cerrarModal}>
                ×
              </button>
            </div>
            <div className="modal-body cols-2">
              <div className="field full">
                <label>Nombre</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setField('nombre', e.target.value)}
                  placeholder="Ej: Programa estándar A"
                />
              </div>
              <div className="field">
                <label>Potencia objetivo (mW)</label>
                <input
                  type="number"
                  value={form.potenciaObjetivoMw}
                  onChange={(e) => setField('potenciaObjetivoMw', e.target.value)}
                  placeholder="Ej: 250"
                />
              </div>
              <div className="field">
                <label>Duración de pulso (ms)</label>
                <input
                  type="number"
                  value={form.duracionPulsoMs}
                  onChange={(e) => setField('duracionPulsoMs', e.target.value)}
                  placeholder="Ej: 400"
                />
              </div>
              <div className="field">
                <label>
                  {form.perfilPeriodo === 'CONSTANTE'
                    ? 'Desplazamiento por pulso (µm)'
                    : 'Período inicial (µm)'}
                </label>
                <input
                  type="number"
                  value={form.desplazamientoUm}
                  onChange={(e) => setField('desplazamientoUm', e.target.value)}
                  placeholder="Ej: 550"
                />
              </div>
              <div className="field full">
                <label>Perfil de período</label>
                <select
                  value={form.perfilPeriodo}
                  onChange={(e) => setField('perfilPeriodo', e.target.value)}
                >
                  {PERFILES_PERIODO.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              {form.perfilPeriodo === 'LINEAL' && (
                <div className="field full">
                  <label>Incremento por marca (µm)</label>
                  <input
                    type="number"
                    value={form.incrementoUm}
                    onChange={(e) => setField('incrementoUm', e.target.value)}
                    placeholder="Ej: 2"
                  />
                </div>
              )}
              {form.perfilPeriodo === 'EXPONENCIAL' && (
                <div className="field full">
                  <label>Factor por marca</label>
                  <input
                    type="number"
                    step="any"
                    value={form.factor}
                    onChange={(e) => setField('factor', e.target.value)}
                    placeholder="Ej: 1.01"
                  />
                </div>
              )}
              <div className="field full">
                <label>Criterio de finalización</label>
                <select value={form.criterioFin} onChange={(e) => setField('criterioFin', e.target.value)}>
                  {CRITERIOS_FIN.map((c) => (
                    <option key={c.valor}>{c.etiqueta}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Distancia total (mm){distanciaDerivada && ' · calculada'}</label>
                <input
                  type="number"
                  value={form.distanciaMm}
                  readOnly={distanciaDerivada}
                  onChange={(e) => setField('distanciaMm', e.target.value)}
                  placeholder="Ej: 10"
                />
              </div>
              <div className="field">
                <label>Pulsos{pulsosDerivados && ' · calculados'}</label>
                <input
                  type="number"
                  value={form.pulsosEstimados}
                  readOnly={pulsosDerivados}
                  onChange={(e) => setField('pulsosEstimados', e.target.value)}
                  placeholder="Ej: 18"
                />
              </div>
              <div className="field full">
                <label>Procedimiento guiado (lo que sigue el operador en «Nuevo ensayo»)</label>
                <select value={form.procedimiento} onChange={(e) => setField('procedimiento', e.target.value)}>
                  <option value="">Sin asignar</option>
                  {procedimientos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.nombre} (v{p.version})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="login-error" style={{ margin: '0 0 12px' }}>{error}</p>}
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={cerrarModal}>
                Cancelar
              </button>
              <button className="primary" type="button" disabled={!form.nombre.trim() || guardando} onClick={guardarPrograma}>
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Guardar programa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-bg" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Eliminar programa</h3>
            <p>
              ¿Seguro que querés eliminar <b>{confirmDelete.nombre}</b>? Si ya se usó en algún ensayo,
              se da de baja en lugar de borrarse, para no perder la trazabilidad de esos ensayos.
            </p>
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button
                className="primary"
                type="button"
                style={{ background: '#c31220', borderColor: '#ff4d5a' }}
                onClick={eliminarPrograma}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
