import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { PROGRAMAS } from '../mock/data'
import { api } from '../mock/api'
import type { Programa } from '../mock/types'
import { useSystem } from '../context/SystemContext'
import { fmt } from '../components/Meters'

const FORM_INICIAL = {
  nombre: '',
  potenciaObjetivoMw: '',
  duracionPulsoMs: '',
  desplazamientoUm: '',
  criterioFin: '',
  distanciaMm: '',
  pulsosEstimados: '',
}

export function Programas() {
  const { rol, setProgramaId } = useSystem()
  const [rows, setRows] = useState<Programa[]>(PROGRAMAS)
  const [sel, setSel] = useState<Programa>(PROGRAMAS[0])
  const canEdit = rol === 'Administrador' || rol === 'Investigador'
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [confirmDelete, setConfirmDelete] = useState<Programa | null>(null)

  useEffect(() => {
    api.listarProgramas().then(setRows)
  }, [])

  const setField = (campo: keyof typeof FORM_INICIAL, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  const cerrarModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(FORM_INICIAL)
  }

  const abrirNuevo = () => {
    setEditId(null)
    setForm(FORM_INICIAL)
    setShowModal(true)
  }

  const abrirEdicion = (p: Programa) => {
    setEditId(p.id)
    setForm({
      nombre: p.nombre,
      potenciaObjetivoMw: String(p.potenciaObjetivoMw),
      duracionPulsoMs: String(p.duracionPulsoMs),
      desplazamientoUm: String(p.desplazamientoUm),
      criterioFin: p.criterioFin,
      distanciaMm: String(p.distanciaMm),
      pulsosEstimados: String(p.pulsosEstimados),
    })
    setShowModal(true)
  }

  const guardarPrograma = async () => {
    if (!form.nombre.trim()) return
    const datos = {
      nombre: form.nombre.trim(),
      potenciaObjetivoMw: Number(form.potenciaObjetivoMw) || 0,
      duracionPulsoMs: Number(form.duracionPulsoMs) || 0,
      desplazamientoUm: Number(form.desplazamientoUm) || 0,
      criterioFin: form.criterioFin.trim() || 'Manual',
      distanciaMm: Number(form.distanciaMm) || 0,
      pulsosEstimados: Number(form.pulsosEstimados) || 0,
    }

    if (editId) {
      const actualizado = await api.actualizarPrograma(editId, datos)
      setRows((r) => r.map((p) => (p.id === editId ? actualizado : p)))
      setSel(actualizado)
    } else {
      const nuevo = await api.crearPrograma(datos, rol)
      setRows((r) => [...r, nuevo])
      setSel(nuevo)
    }
    cerrarModal()
  }

  const eliminarPrograma = async () => {
    if (!confirmDelete) return
    const restantes = await api.eliminarPrograma(confirmDelete.id)
    setRows(restantes)
    if (sel.id === confirmDelete.id) setSel(restantes[0])
    setConfirmDelete(null)
  }

  return (
    <>
      <h1 className="page-title">Programas de grabado</h1>
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
                  <tr key={p.id} className={sel.id === p.id ? 'sel' : ''} onClick={() => setSel(p)}>
                    <td>{p.nombre}</td>
                    <td className="mono">{fmt(p.potenciaObjetivoMw)} mW</td>
                    <td className="mono">{p.duracionPulsoMs} ms</td>
                    <td className="mono">{p.desplazamientoUm} µm</td>
                    <td className="mono">{p.pulsosEstimados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

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
              <span>Potencia objetivo</span>
              <b>{fmt(sel.potenciaObjetivoMw)} mW</b>
            </div>
            <div>
              <span>Duración de pulso</span>
              <b>{sel.duracionPulsoMs} ms</b>
            </div>
            <div>
              <span>Desplazamiento por pulso</span>
              <b>{sel.desplazamientoUm} µm</b>
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
              <span>Última actualización</span>
              <b>{sel.actualizado}</b>
            </div>
            <div>
              <span>Creado por</span>
              <b>{sel.creadoPor}</b>
            </div>
          </div>
        </section>
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
                  placeholder="Ej: 10"
                />
              </div>
              <div className="field">
                <label>Desplazamiento por pulso (µm)</label>
                <input
                  type="number"
                  value={form.desplazamientoUm}
                  onChange={(e) => setField('desplazamientoUm', e.target.value)}
                  placeholder="Ej: 5"
                />
              </div>
              <div className="field full">
                <label>Criterio de finalización</label>
                <input
                  type="text"
                  value={form.criterioFin}
                  onChange={(e) => setField('criterioFin', e.target.value)}
                  placeholder="Ej: Distancia alcanzada"
                />
              </div>
              <div className="field">
                <label>Distancia total (mm)</label>
                <input
                  type="number"
                  value={form.distanciaMm}
                  onChange={(e) => setField('distanciaMm', e.target.value)}
                  placeholder="Ej: 50"
                />
              </div>
              <div className="field">
                <label>Pulsos estimados</label>
                <input
                  type="number"
                  value={form.pulsosEstimados}
                  onChange={(e) => setField('pulsosEstimados', e.target.value)}
                  placeholder="Ej: 1000"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={cerrarModal}>
                Cancelar
              </button>
              <button className="primary" type="button" disabled={!form.nombre.trim()} onClick={guardarPrograma}>
                {editId ? 'Guardar cambios' : 'Guardar programa'}
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
              ¿Seguro que querés eliminar <b>{confirmDelete.nombre}</b>? Esta acción no se puede
              deshacer.
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
