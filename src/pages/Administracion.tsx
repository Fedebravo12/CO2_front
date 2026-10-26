import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { ErrorApi } from '../api/http'
import type { ComponenteConfig, Auditoria, EstadoComponente, HardwareConfig, Umbral, Usuario } from '../mock/types'
import { useSystem } from '../context/SystemContext'


// Estructura vacía para reiniciar el formulario modal sin ID técnico
const NUEVO_COMPONENTE_VACIO = {
  nombre: '',
  config: {
    tipo: '',
    pines: {} as Record<string, string>,
    estado: 'Vigente' as EstadoComponente,
    parametros: {},
  },
}

export function Administracion() {
  const { seccion = 'usuarios' } = useParams()
  const { rol } = useSystem()
  const [users, setUsers] = useState<Usuario[]>([])
  const [audit, setAudit] = useState<Auditoria[]>([])
  const [umbrales, setUmbrales] = useState<Umbral[]>([])
  const [auditoriaBloqueada, setAuditoriaBloqueada] = useState(false)

  // Estado para la configuración de hardware (mapeado por componente)
  const [hardware, setHardware] = useState<HardwareConfig>({ componentes: {} })
  const [mostrarInhabilitados, setMostrarInhabilitados] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardadoExito, setGuardadoExito] = useState(false)

  // Estados dinámicos para el formulario modal
  const [formComp, setFormComp] = useState(NUEVO_COMPONENTE_VACIO)
  const [tempPinNombre, setTempPinNombre] = useState('')
  const [tempPinVal, setTempPinVal] = useState('')

  useEffect(() => {
    api.listarUsuarios().then(setUsers).catch(() => setUsers([]))
    api.listarUmbrales().then(setUmbrales).catch(() => setUmbrales([]))

    // Carga la configuración de hardware desde el JSON
    if (api.obtenerHardwareConfig) {
      api.obtenerHardwareConfig()
        .then((data) => setHardware(data || { componentes: {} }))
        .catch(() => setHardware({ componentes: {} }))
    }

    // La auditoría es solo del administrador (RN010): el resto recibe 403.
    api
      .listarAuditoria()
      .then(setAudit)
      .catch((e) => setAuditoriaBloqueada(e instanceof ErrorApi && e.status === 403))
  }, [])

  const blocked = rol !== 'Administrador'

  // Alterna el estado de un componente entre 'Vigente' y 'Eliminado'
  const toggleEstadoComponente = (nombre: string) => {
    if (blocked) return
    setHardware((prev) => {
      const actual = prev.componentes[nombre]
      if (!actual) return prev
      const nuevoEstado: EstadoComponente = actual.estado === 'Vigente' ? 'Eliminado' : 'Vigente'
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          [nombre]: { ...actual, estado: nuevoEstado },
        },
      }
    })
  }

  // Agrega un nuevo pin dinámico (nombre + GPIO/Etiqueta)
  const handleAgregarPin = () => {
    if (!tempPinNombre.trim() || !tempPinVal.trim()) return

    setFormComp((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        pines: {
          ...prev.config.pines,
          [tempPinNombre.trim()]: tempPinVal.trim(),
        },
      },
    }))

    setTempPinNombre('')
    setTempPinVal('')
  }

  // Quita un pin de la lista temporal
  const handleRemoverPin = (nombrePin: string) => {
    setFormComp((prev) => {
      const nuevosPines = { ...prev.config.pines }
      delete nuevosPines[nombrePin]
      return {
        ...prev,
        config: { ...prev.config, pines: nuevosPines },
      }
    })
  }

  // Guarda el componente ingresado usando su nombre como identificador único
  const handleGuardarComponente = () => {
    const nombreLimpio = formComp.nombre.trim()
    if (!nombreLimpio) return

    if (hardware.componentes[nombreLimpio]) {
      alert('Ya existe un componente registrado con este nombre.')
      return
    }

    const nuevoComponente: ComponenteConfig = {
      tipo: formComp.config.tipo.trim(),
      pines: formComp.config.pines,
      estado: 'Vigente',
      parametros: formComp.config.parametros || {},
    }

    setHardware((prev) => ({
      ...prev,
      componentes: {
        ...prev.componentes,
        [nombreLimpio]: nuevoComponente,
      },
    }))

    setModalOpen(false)
    setFormComp(NUEVO_COMPONENTE_VACIO)
  }

  // Persiste la estructura final del JSON en el backend Django
  const handleGuardarHardware = async () => {
    setGuardando(true)
    try {
      if (api.guardarHardwareConfig) {
        await api.guardarHardwareConfig(hardware)
        setGuardadoExito(true)
        setTimeout(() => setGuardadoExito(false), 3000)
      }
    } catch (err) {
      console.error('Error al guardar hardware config:', err)
    } finally {
      setGuardando(false)
    }
  }

  // Filtrar componentes según el estado toggle
  const componentesVisibles = Object.entries(hardware.componentes || {}).filter(
    ([_, item]) => mostrarInhabilitados || item.estado === 'Vigente'
  )

  return (
    <>
      <h1 className="page-title">Administración</h1>
      <div className="tabs">
        <NavLink to="/admin/usuarios" className={seccion === 'usuarios' ? 'active' : ''}>
          Usuarios y roles
        </NavLink>
        <NavLink to="/admin/hardware" className={seccion === 'hardware' ? 'active' : ''}>
          Configuración de hardware
        </NavLink>
        <NavLink to="/admin/umbrales" className={seccion === 'umbrales' ? 'active' : ''}>
          Umbrales
        </NavLink>
        <NavLink to="/admin/auditoria" className={seccion === 'auditoria' ? 'active' : ''}>
          Auditoría
        </NavLink>
      </div>

      {blocked && (
        <p style={{ color: 'var(--orange)' }}>
          Vista de solo lectura. La edición de usuarios y umbrales es del administrador.
        </p>
      )}

      {/* ── 1. Sección Usuarios ───────────────────────────────────────────── */}
      {seccion === 'usuarios' && (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NOMBRE</th>
                  <th>USUARIO</th>
                  <th>ROL</th>
                  <th>ESTADO</th>
                  <th>ÚLTIMO ACCESO</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nombre}</td>
                    <td className="mono">{u.usuario}</td>
                    <td>{u.rol}</td>
                    <td>
                      <span className={`st ${u.activo ? 'ok' : 'warn'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td className="mono">{u.ultimoAcceso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 2. Sección Hardware ───────────────────────────────────────────── */}
      {seccion === 'hardware' && (
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
            <h2>Configuración de Componentes</h2>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              
              <label className="switch-container" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)' }}>
                <span>Mostrar inhabilitados</span>
                <div className={`switch ${mostrarInhabilitados ? 'active' : ''}`} onClick={() => setMostrarInhabilitados(!mostrarInhabilitados)}>
                  <div className="switch-thumb" />
                </div>
              </label>

              {!blocked && (
                <>
                  <button
                    type="button"
                    className="btn-secundario ghost"
                    onClick={() => {
                      setFormComp(NUEVO_COMPONENTE_VACIO)
                      setModalOpen(true)
                    }}
                  >
                    + Agregar Componente
                  </button>
                  <button type="button" className="btn-primario ghost" onClick={handleGuardarHardware} disabled={guardando}>
                    {guardando ? 'Guardando...' : guardadoExito ? '¡Guardado!' : 'Guardar JSON'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NOMBRE COMPONENTE</th>
                  <th>TIPO / CLASE</th>
                  <th>PINES / CONEXIÓN</th>
                  <th>ESTADO</th>
                  {!blocked && <th>ACCIÓN</th>}
                </tr>
              </thead>
              <tbody>
                {componentesVisibles.length === 0 ? (
                  <tr>
                    <td colSpan={blocked ? 4 : 5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                      {mostrarInhabilitados
                        ? 'No hay componentes registrados.'
                        : 'No hay componentes habilitados en la configuración.'}
                    </td>
                  </tr>
                ) : (
                  componentesVisibles.map(([nombre, item]) => (
                    <tr key={nombre} style={{ opacity: item.estado === 'Eliminado' ? 0.5 : 1 }}>
                      <td><strong>{nombre}</strong></td>
                      <td>
                        <span className="st info">{item.tipo}</span>
                      </td>
                      <td className="mono">
                        {Object.entries(item.pines).map(([pNombre, pVal]) => (
                          <span key={pNombre} style={{ marginRight: '10px' }}>
                            {pNombre}: <strong>{String(pVal)}</strong>
                          </span>
                        ))}
                      </td>
                      <td>
                        <span className={`st ${item.estado === 'Vigente' ? 'ok' : 'danger'}`}>
                          {item.estado}
                        </span>
                      </td>
                      {!blocked && (
                        <td>
                          <button
                            type="button"
                            className={`btn-secundario ghost ${item.estado === 'Vigente' ? 'danger' : 'ok'}`}
                            style={{
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.8rem',
                              color: item.estado === 'Vigente' ? 'var(--red)' : 'var(--green)',
                              borderColor: item.estado === 'Vigente' ? 'var(--red)' : 'var(--green)',
                            }}
                            onClick={() => toggleEstadoComponente(nombre)}
                          >
                            {item.estado === 'Vigente' ? 'Inhabilitar' : 'Habilitar'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 3. Sección Umbrales ───────────────────────────────────────────── */}
      {seccion === 'umbrales' && (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PARÁMETRO</th>
                  <th>MÍN</th>
                  <th>MÁX</th>
                  <th>UNIDAD</th>
                  <th>CRÍTICO</th>
                </tr>
              </thead>
              <tbody>
                {umbrales.map((u) => (
                  <tr key={u.id}>
                    <td>{u.parametro}</td>
                    <td className="mono">{u.min}</td>
                    <td className="mono">{u.max}</td>
                    <td>{u.unidad}</td>
                    <td>
                      <span className={`st ${u.critico ? 'danger' : 'info'}`}>{u.critico ? 'Sí' : 'No'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 4. Sección Auditoría ─────────────────────────────────────────── */}
      {seccion === 'auditoria' && auditoriaBloqueada && (
        <section className="panel">
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            El log de auditoría es visible solo para el administrador.
          </p>
        </section>
      )}

      {seccion === 'auditoria' && !auditoriaBloqueada && (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>FECHA</th>
                  <th>USUARIO</th>
                  <th>ACCIÓN</th>
                  <th>DETALLE</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.fecha}</td>
                    <td className="mono">{a.usuario}</td>
                    <td>
                      <span className="st info">{a.accion}</span>
                    </td>
                    <td>{a.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Modal Flotante de Alta de Componente ─────────────────────────── */}
      {modalOpen && (
        <div className="modal-bg" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Agregar Componente</h3>

            <div className="field">
              <h4>Nombre del Componente:</h4>
              <input
                type="text"
                placeholder="ej: Sensor de temperatura del láser"
                value={formComp.nombre}
                onChange={(e) =>
                  setFormComp((prev) => ({
                    ...prev,
                    nombre: e.target.value,
                  }))
                }
              />
            </div>

            <div className="field">
              <h4>Tipo / Clase de Componente:</h4>
              <input
                type="text"
                placeholder="ej: LM35, HC-SR04, STEPPER_EM-257"
                value={formComp.config.tipo}
                onChange={(e) =>
                  setFormComp((prev) => ({
                    ...prev,
                    config: { ...prev.config, tipo: e.target.value },
                  }))
                }
              />
            </div>

            {/* Carga dinámica de N pines con nombre y asignación (ej: Trig -> GPIO17) */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
              <label><strong>Asignación de Pines:</strong></label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Nombre del pin (ej: Datos, Trig)"
                  value={tempPinNombre}
                  className="ghost"
                  onChange={(e) => setTempPinNombre(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Asignación (ej: GPIO27)"
                  style={{ width: '140px' }}
                  value={tempPinVal}
                  className="ghost"
                  onChange={(e) => setTempPinVal(e.target.value)}
                />
                <button type="button" className="btn-secundario ghost" onClick={handleAgregarPin}>
                  +
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                {Object.entries(formComp.config.pines).map(([pNombre, pVal]) => (
                  <span key={pNombre} className="st info" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {pNombre}: <strong>{pVal}</strong>
                    <button
                      type="button"
                      onClick={() => handleRemoverPin(pNombre)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="primary" onClick={handleGuardarComponente}>
                Guardar Componente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}