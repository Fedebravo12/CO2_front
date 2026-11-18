import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import { hardwareApi, type DriverInfo } from '../api/hardware'
import type { ComponenteConfig, NodoPaso, ProcedimientoGuiado, Programa, ResumenPasos } from '../mock/types'
import { useSystem } from '../context/SystemContext'
import { fmt } from '../components/Meters'
import { EditorPasos } from '../components/EditorPasos'
import { resumenPasos } from '../components/resumenPasos'

const FORM_INICIAL = {
  nombre: '',
  descripcion: '',
  /** Código del procedimiento guiado; vacío = sin asignar. */
  procedimiento: '',
}

/** «N pulsos · recorrido por motor · duración mínima», con la unidad de cada eje si se conoce. */
export function textoResumen(r: ResumenPasos, componentes: Record<string, ComponenteConfig>): string {
  const recorrido = Object.entries(r.recorrido)
    .map(([motor, v]) => `${motor} ${fmt(v)} ${(componentes[motor]?.parametros?.unidad as string | undefined) ?? ''}`.trim())
    .join(', ')
  return `${r.pulsos} pulsos · ${recorrido || 'sin recorrido'} · ${fmt(r.duracionMinimaMs / 1000, 1)} s mínimo`
}

export function Programas() {
  const { rol, programas: rows, recargarProgramas } = useSystem()
  const [selId, setSelId] = useState<string | null>(null)
  const sel = rows.find((p) => p.id === selId) ?? rows[0] ?? null
  const canEdit = rol === 'Administrador' || rol === 'Investigador'
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [pasos, setPasos] = useState<NodoPaso[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Programa | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [procedimientos, setProcedimientos] = useState<ProcedimientoGuiado[]>([])
  const [componentes, setComponentes] = useState<Record<string, ComponenteConfig>>({})
  const [catalogo, setCatalogo] = useState<Record<string, DriverInfo>>({})

  useEffect(() => {
    api.listarProcedimientos().then(setProcedimientos).catch(() => setProcedimientos([]))
  }, [])

  // Inventario y fichas para el editor: el back arma el inventario (archivo de hardware en GPIO,
  // el simulado si no) y el catálogo da los comandos de cada tipo.
  useEffect(() => {
    Promise.all([api.inventarioProgramas(), hardwareApi.catalogo()])
      .then(([inventario, fichas]) => {
        setComponentes(inventario.componentes)
        setCatalogo(fichas)
      })
      .catch(() => {
        setComponentes({})
        setCatalogo({})
      })
  }, [])

  const resumenEnEdicion = useMemo(() => resumenPasos(pasos), [pasos])

  const cerrarModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(FORM_INICIAL)
    setPasos([])
    setError(null)
  }

  const abrirNuevo = () => {
    setEditId(null)
    setForm(FORM_INICIAL)
    setPasos([])
    setError(null)
    setShowModal(true)
  }

  const abrirEdicion = (p: Programa) => {
    setEditId(p.id)
    setError(null)
    setForm({ nombre: p.nombre, descripcion: p.descripcion, procedimiento: p.procedimiento ?? '' })
    // Un programa viejo (sin validar) no tiene pasos que mostrar: se rearma desde cero.
    setPasos(p.validado ? p.pasos : [])
    setShowModal(true)
  }

  const guardarPrograma = async () => {
    if (!form.nombre.trim()) return
    const datos = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
      procedimiento: form.procedimiento || null,
      pasos,
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
      // El back dice dónde está el problema («pasos: Paso 3.1: ...»): se muestra tal cual.
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
                  <th>PULSOS</th>
                  <th>DURACIÓN MÍN.</th>
                  <th>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={sel?.id === p.id ? 'sel' : ''} onClick={() => setSelId(p.id)}>
                    <td>{p.nombre}</td>
                    <td className="mono">{p.resumen ? p.resumen.pulsos : '—'}</td>
                    <td className="mono">{p.resumen ? `${fmt(p.resumen.duracionMinimaMs / 1000, 1)} s` : '—'}</td>
                    <td>{p.validado ? 'Validado' : 'Sin validar'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--muted)' }}>
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
                      <Pencil size={16} /> {sel.validado ? 'Editar' : 'Rearmar con pasos'}
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
                <span>Versión</span>
                <b>v{sel.version}</b>
              </div>
              <div>
                <span>Resumen</span>
                <b>{sel.resumen ? textoResumen(sel.resumen, componentes) : '—'}</b>
              </div>
              {!sel.validado && (
                <div>
                  <span>Estado</span>
                  <b role="alert" style={{ color: 'var(--red)' }}>
                    Sin validar: es de una versión anterior y hay que rearmarlo con pasos.
                  </b>
                </div>
              )}
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
          <div className="modal" style={{ width: 'min(760px, calc(100% - 32px))', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
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
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Red helicoidal"
                />
              </div>
              <div className="field full">
                <label>Procedimiento guiado (lo que sigue el operador en «Nuevo ensayo»)</label>
                <select value={form.procedimiento} onChange={(e) => setForm((f) => ({ ...f, procedimiento: e.target.value }))}>
                  <option value="">Sin asignar</option>
                  {procedimientos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.nombre} (v{p.version})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label>Pasos</label>
                {Object.keys(componentes).length === 0 && (
                  <small role="alert" style={{ color: 'var(--red)' }}>
                    No hay inventario de hardware disponible: no se pueden armar acciones.
                  </small>
                )}
                <EditorPasos pasos={pasos} componentes={componentes} catalogo={catalogo} onChange={setPasos} />
              </div>
              <div className="field full">
                <label>Resumen</label>
                <b>{pasos.length ? textoResumen(resumenEnEdicion, componentes) : 'Agregue pasos para ver el resumen.'}</b>
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
