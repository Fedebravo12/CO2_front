import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { api, type DatosUsuario } from '../api/client'
import { ErrorApi } from '../api/http'
import type {
  AccionUmbral,
  Auditoria,
  ComponenteConfig,
  EstadoComponente,
  HardwareConfig,
  Rol,
  SeveridadUmbral,
  Umbral,
  Usuario,
} from '../mock/types'
import { useAuth } from '../context/AuthContext'
import { useSystem } from '../context/SystemContext'

const ROLES: Rol[] = ['Operador', 'Investigador', 'Administrador']

const SEVERIDADES_UMBRAL: Record<SeveridadUmbral, string> = {
  INFO: 'Informativa',
  ADVERTENCIA: 'Advertencia',
  CRITICA: 'Crítica',
}

const ACCIONES_UMBRAL: Record<AccionUmbral, string> = {
  ALERTA: 'Solo alertar',
  BLOQUEAR_COMANDO: 'Bloquear comandos',
  PARADA_EMERGENCIA: 'Parada de emergencia',
}

const FORM_USUARIO: DatosUsuario = {
  usuario: '',
  nombreDePila: '',
  apellido: '',
  email: '',
  legajo: '',
  rol: 'Operador',
  password: '',
}

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
  const { usuario: sesion } = useAuth()

  // ABM de usuarios (solo administrador, RF011): `editId` null es un alta.
  const [showUsuario, setShowUsuario] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<DatosUsuario>(FORM_USUARIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [confirmBaja, setConfirmBaja] = useState<Usuario | null>(null)
  const [errorUsuarios, setErrorUsuarios] = useState<string | null>(null)

  const recargarUsuarios = () => api.listarUsuarios().then(setUsers).catch(() => setUsers([]))
  const setCampo = (campo: keyof DatosUsuario, valor: string) => setForm((f) => ({ ...f, [campo]: valor }))
  const esYo = (u: Usuario) => u.usuario === sesion?.username

  const abrirAlta = () => {
    setEditId(null)
    setForm(FORM_USUARIO)
    setErrorForm(null)
    setShowUsuario(true)
  }

  const abrirEdicion = (u: Usuario) => {
    setEditId(u.id)
    setForm({
      usuario: u.usuario,
      nombreDePila: u.nombreDePila ?? '',
      apellido: u.apellido ?? '',
      email: u.email ?? '',
      legajo: u.legajo ?? '',
      rol: u.rol,
      password: '',
    })
    setErrorForm(null)
    setShowUsuario(true)
  }

  const cerrarUsuario = () => {
    setShowUsuario(false)
    setEditId(null)
    setErrorForm(null)
  }

  const guardarUsuario = async () => {
    setGuardando(true)
    try {
      if (editId) await api.actualizarUsuario(editId, form)
      else await api.crearUsuario(form)
      await recargarUsuarios()
      cerrarUsuario()
    } catch (e) {
      setErrorForm((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const darDeBaja = async () => {
    if (!confirmBaja) return
    setErrorUsuarios(null)
    try {
      await api.darDeBajaUsuario(confirmBaja.id)
      await recargarUsuarios()
    } catch (e) {
      setErrorUsuarios((e as Error).message)
    }
    setConfirmBaja(null)
  }

  const reactivar = async (u: Usuario) => {
    setErrorUsuarios(null)
    try {
      await api.reactivarUsuario(u.id)
      await recargarUsuarios()
    } catch (e) {
      setErrorUsuarios((e as Error).message)
    }
  }

  // Edición de umbrales (solo administrador, RF016). Los números van como texto
  // mientras se escriben, para no pelear con el input vacío o con "1.".
  const [umbralEdit, setUmbralEdit] = useState<Umbral | null>(null)
  const [formUmbral, setFormUmbral] = useState({
    min: '',
    max: '',
    severidad: 'ADVERTENCIA' as SeveridadUmbral,
    accion: 'ALERTA' as AccionUmbral,
    activo: true,
  })
  const [guardandoUmbral, setGuardandoUmbral] = useState(false)
  const [errorFormUmbral, setErrorFormUmbral] = useState<string | null>(null)

  const abrirUmbral = (u: Umbral) => {
    setUmbralEdit(u)
    setFormUmbral({ min: String(u.min), max: String(u.max), severidad: u.severidad, accion: u.accion, activo: u.activo })
    setErrorFormUmbral(null)
  }

  const minUmbral = Number(formUmbral.min)
  const maxUmbral = Number(formUmbral.max)
  const rangoInvalido =
    formUmbral.min.trim() === '' ||
    formUmbral.max.trim() === '' ||
    !Number.isFinite(minUmbral) ||
    !Number.isFinite(maxUmbral) ||
    minUmbral >= maxUmbral
  const debilitaProteccion =
    umbralEdit !== null &&
    umbralEdit.activo &&
    umbralEdit.accion === 'PARADA_EMERGENCIA' &&
    (!formUmbral.activo || formUmbral.accion !== 'PARADA_EMERGENCIA')

  const guardarUmbral = async () => {
    if (!umbralEdit || rangoInvalido) return
    setGuardandoUmbral(true)
    try {
      await api.actualizarUmbral(umbralEdit.id, {
        min: minUmbral,
        max: maxUmbral,
        severidad: formUmbral.severidad,
        accion: formUmbral.accion,
        activo: formUmbral.activo,
      })
      // El id cambia (versión nueva de la configuración): se relee la lista.
      setUmbrales(await api.listarUmbrales())
      setUmbralEdit(null)
    } catch (e) {
      setErrorFormUmbral((e as Error).message)
    } finally {
      setGuardandoUmbral(false)
    }
  }

  const formValido =
    form.usuario.trim() !== '' && (editId !== null || (form.password ?? '').length > 0) && !guardando

  // Estado para la configuración de hardware (mapeado por componente)
  const [hardware, setHardware] = useState<HardwareConfig>({ componentes: {} })
  const [mostrarInhabilitados, setMostrarInhabilitados] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [guardandoHw, setGuardandoHw] = useState(false)
  const [guardadoExito, setGuardadoExito] = useState(false)

  // Estados dinámicos para el formulario modal
  const [formComp, setFormComp] = useState(NUEVO_COMPONENTE_VACIO)
  const [tempPinNombre, setTempPinNombre] = useState('')
  const [tempPinVal, setTempPinVal] = useState('')

  useEffect(() => {
    recargarUsuarios()
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
    setGuardandoHw(true)
    try {
      if (api.guardarHardwareConfig) {
        await api.guardarHardwareConfig(hardware)
        setGuardadoExito(true)
        setTimeout(() => setGuardadoExito(false), 3000)
      }
    } catch (err) {
      console.error('Error al guardar hardware config:', err)
    } finally {
      setGuardandoHw(false)
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
          Vista de solo lectura. La gestión de usuarios y umbrales es exclusiva del administrador.
        </p>
      )}

      {/* ── 1. Sección Usuarios ───────────────────────────────────────────── */}
      {seccion === 'usuarios' && (
        <section className="panel">
          {!blocked && (
            <div className="panel-head">
              <h3>USUARIOS</h3>
              <button className="primary" type="button" onClick={abrirAlta}>
                <Plus size={16} /> Nuevo usuario
              </button>
            </div>
          )}
          {errorUsuarios && <p className="login-error" style={{ marginBottom: 12 }}>{errorUsuarios}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NOMBRE</th>
                  <th>USUARIO</th>
                  <th>ROL</th>
                  <th>ESTADO</th>
                  <th>ÚLTIMO ACCESO</th>
                  {!blocked && <th>ACCIONES</th>}
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
                    {!blocked && (
                      <td>
                        <div className="acciones-fila">
                          <button className="ghost" type="button" onClick={() => abrirEdicion(u)} title="Editar usuario">
                            <Pencil size={14} /> Editar
                          </button>
                          {u.activo ? (
                            <button
                              className="ghost"
                              type="button"
                              disabled={esYo(u)}
                              onClick={() => setConfirmBaja(u)}
                              title={esYo(u) ? 'No podés darte de baja a vos mismo' : 'Dar de baja'}
                            >
                              <UserX size={14} /> Dar de baja
                            </button>
                          ) : (
                            <button className="ghost" type="button" onClick={() => reactivar(u)} title="Reactivar">
                              <UserCheck size={14} /> Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showUsuario && (
        <div className="modal-bg" onClick={cerrarUsuario}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ width: 'min(620px, calc(100% - 32px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{editId ? 'Editar usuario' : 'Nuevo usuario'}</h3>
              <button className="modal-close" type="button" onClick={cerrarUsuario} aria-label="Cerrar">
                ×
              </button>
            </div>
            <div className="modal-body cols-2">
              <div className="field">
                <label>Nombre</label>
                <input type="text" value={form.nombreDePila} onChange={(e) => setCampo('nombreDePila', e.target.value)} />
              </div>
              <div className="field">
                <label>Apellido</label>
                <input type="text" value={form.apellido} onChange={(e) => setCampo('apellido', e.target.value)} />
              </div>
              <div className="field">
                <label>Usuario</label>
                <input
                  type="text"
                  value={form.usuario}
                  autoComplete="off"
                  onChange={(e) => setCampo('usuario', e.target.value)}
                  placeholder="Ej: lperez"
                />
              </div>
              <div className="field">
                <label>Legajo</label>
                <input type="text" value={form.legajo} onChange={(e) => setCampo('legajo', e.target.value)} />
              </div>
              <div className="field full">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setCampo('email', e.target.value)} />
              </div>
              <div className="field">
                <label>Rol</label>
                <select
                  value={form.rol}
                  disabled={editId !== null && users.some((u) => u.id === editId && esYo(u))}
                  onChange={(e) => setCampo('rol', e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{editId ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
                <input
                  type="password"
                  value={form.password ?? ''}
                  autoComplete="new-password"
                  onChange={(e) => setCampo('password', e.target.value)}
                  placeholder={editId ? 'Dejar vacío para no cambiarla' : ''}
                />
              </div>
            </div>
            {errorForm && <p className="login-error" style={{ margin: '12px 0' }}>{errorForm}</p>}
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={cerrarUsuario}>
                Cancelar
              </button>
              <button className="primary" type="button" disabled={!formValido} onClick={guardarUsuario}>
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBaja && (
        <div className="modal-bg" onClick={() => setConfirmBaja(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Dar de baja usuario</h3>
            <p>
              ¿Seguro que querés dar de baja a <b>{confirmBaja.nombre}</b>? No va a poder ingresar al sistema. No se
              borra: sus ensayos y su historial de auditoría se conservan, y se puede reactivar.
            </p>
            <div className="modal-actions">
              <button className="ghost" type="button" autoFocus onClick={() => setConfirmBaja(null)}>
                Cancelar
              </button>
              <button
                className="primary"
                type="button"
                style={{ background: '#c31220', borderColor: '#ff4d5a' }}
                onClick={darDeBaja}
              >
                Dar de baja
              </button>
            </div>
          </div>
        </div>
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
                  <button type="button" className="btn-primario ghost" onClick={handleGuardarHardware} disabled={guardandoHw}>
                    {guardandoHw ? 'Guardando...' : guardadoExito ? '¡Guardado!' : 'Guardar JSON'}
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
          {!blocked && (
            <p style={{ color: 'var(--muted)', margin: '0 0 12px', fontSize: 13 }}>
              Cada cambio crea una versión nueva de la configuración y el controlador la aplica en unos segundos.
              Los ensayos anteriores conservan los umbrales con los que corrieron.
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PARÁMETRO</th>
                  <th>MÍN</th>
                  <th>MÁX</th>
                  <th>UNIDAD</th>
                  <th>AL EXCEDERSE</th>
                  <th>CRÍTICO</th>
                  {!blocked && <th>ACCIONES</th>}
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
                      {u.activo ? ACCIONES_UMBRAL[u.accion] : <span className="st warn">Desactivado</span>}
                    </td>
                    <td>
                      <span className={`st ${u.critico ? 'danger' : 'info'}`}>{u.critico ? 'Sí' : 'No'}</span>
                    </td>
                    {!blocked && (
                      <td>
                        <div className="acciones-fila">
                          <button className="ghost" type="button" onClick={() => abrirUmbral(u)} title="Editar umbral">
                            <Pencil size={14} /> Editar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {umbralEdit && (
        <div className="modal-bg" onClick={() => setUmbralEdit(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ width: 'min(560px, calc(100% - 32px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Editar umbral · {umbralEdit.parametro}</h3>
              <button className="modal-close" type="button" onClick={() => setUmbralEdit(null)} aria-label="Cerrar">
                ×
              </button>
            </div>
            <div className="modal-body cols-2">
              <div className="field">
                <label>Mínimo ({umbralEdit.unidad})</label>
                <input
                  type="number"
                  step="any"
                  value={formUmbral.min}
                  onChange={(e) => setFormUmbral((f) => ({ ...f, min: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Máximo ({umbralEdit.unidad})</label>
                <input
                  type="number"
                  step="any"
                  value={formUmbral.max}
                  onChange={(e) => setFormUmbral((f) => ({ ...f, max: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Severidad</label>
                <select
                  value={formUmbral.severidad}
                  onChange={(e) => setFormUmbral((f) => ({ ...f, severidad: e.target.value as SeveridadUmbral }))}
                >
                  {Object.entries(SEVERIDADES_UMBRAL).map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Al excederse</label>
                <select
                  value={formUmbral.accion}
                  onChange={(e) => setFormUmbral((f) => ({ ...f, accion: e.target.value as AccionUmbral }))}
                >
                  {Object.entries(ACCIONES_UMBRAL).map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <label className="field full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formUmbral.activo}
                  onChange={(e) => setFormUmbral((f) => ({ ...f, activo: e.target.checked }))}
                  style={{ width: 'auto' }}
                />
                Umbral activo (si se desactiva, el controlador deja de vigilar esta variable)
              </label>
            </div>
            {rangoInvalido && (
              <p className="login-error" style={{ margin: '12px 0' }}>
                El máximo tiene que ser mayor que el mínimo. Revisá los dos valores.
              </p>
            )}
            {debilitaProteccion && (
              <p className="aviso-ctrl warn" style={{ margin: '12px 0' }}>
                Este umbral hoy dispara la parada de emergencia. Con este cambio deja de hacerlo: confirmá que es lo
                que querés.
              </p>
            )}
            {errorFormUmbral && <p className="login-error" style={{ margin: '12px 0' }}>{errorFormUmbral}</p>}
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setUmbralEdit(null)}>
                Cancelar
              </button>
              <button
                className="primary"
                type="button"
                disabled={rangoInvalido || guardandoUmbral}
                onClick={guardarUmbral}
              >
                {guardandoUmbral ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
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