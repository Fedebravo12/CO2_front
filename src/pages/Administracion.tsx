import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { api, type DatosUsuario } from '../api/client'
import { ErrorApi } from '../api/http'
import type { Auditoria, Rol, Umbral, Usuario } from '../mock/types'
import { useAuth } from '../context/AuthContext'
import { useSystem } from '../context/SystemContext'

const ROLES: Rol[] = ['Operador', 'Investigador', 'Administrador']

const FORM_USUARIO: DatosUsuario = {
  usuario: '',
  nombreDePila: '',
  apellido: '',
  email: '',
  legajo: '',
  rol: 'Operador',
  password: '',
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

  const formValido =
    form.usuario.trim() !== '' && (editId !== null || (form.password ?? '').length > 0) && !guardando

  useEffect(() => {
    recargarUsuarios()
    api.listarUmbrales().then(setUmbrales).catch(() => setUmbrales([]))
    // La auditoría es solo del administrador (RN010): el resto recibe 403.
    api
      .listarAuditoria()
      .then(setAudit)
      .catch((e) => setAuditoriaBloqueada(e instanceof ErrorApi && e.status === 403))
  }, [])

  const blocked = rol !== 'Administrador'

  return (
    <>
      <h1 className="page-title">Administración</h1>
      <div className="tabs">
        <NavLink to="/admin/usuarios" className={seccion === 'usuarios' ? 'active' : ''}>
          Usuarios y roles
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
    </>
  )
}
