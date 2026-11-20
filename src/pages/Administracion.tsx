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
import { armarComponente, esRolNumerico, hardwareApi, rolesPosibles, type DriverInfo } from '../api/hardware'
import { Confirmacion } from '../components/Confirmacion'

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

// Estructura vacía para reiniciar el formulario de componente sin ID técnico
const NUEVO_COMPONENTE_VACIO = {
  nombre: '',
  config: {
    tipo: '',
    pines: {} as Record<string, string>,
    estado: 'Vigente' as EstadoComponente,
    parametros: {},
    rol: '',
    ganancia: 1,
    offset: 0,
    inhibir_en_prueba: false,
  } as ComponenteConfig,
}

export function Administracion() {
  const { seccion = 'usuarios' } = useParams()
  const { rol, controlador } = useSystem()
  // La configuración de componentes solo la aplica el controlador en modo GPIO.
  const modoSimulado = controlador?.modo_hal === 'simulado'
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
  const [revisionHw, setRevisionHw] = useState('')
  const [errorHw, setErrorHw] = useState('')
  const [catalogo, setCatalogo] = useState<Record<string, DriverInfo>>({})
  const [editComp, setEditComp] = useState<string | null>(null)
  const [parametrosTexto, setParametrosTexto] = useState('{}')
  const cargarHardware = () => api.obtenerHardwareConfig().then(({ config, revision }) => {
    setHardware(config)
    setRevisionHw(revision)
    setErrorHw('')
  }).catch((e: Error) => { setRevisionHw(''); setErrorHw(e.message) })
  const [mostrarInhabilitados, setMostrarInhabilitados] = useState(false)
  const [formCompAbierto, setFormCompAbierto] = useState(false)
  const [errorComp, setErrorComp] = useState<string | null>(null)
  const [guardandoHw, setGuardandoHw] = useState(false)
  const [guardadoExito, setGuardadoExito] = useState(false)

  // Estados dinámicos para el formulario de alta de componente
  const [formComp, setFormComp] = useState(NUEVO_COMPONENTE_VACIO)

  useEffect(() => {
    recargarUsuarios()
    api.listarUmbrales().then(setUmbrales).catch(() => setUmbrales([]))

    // Carga la configuración de hardware desde el JSON
    void cargarHardware()
    hardwareApi.catalogo().then(setCatalogo).catch((e: Error) => setErrorHw(e.message))

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

  // Asigna el contacto de un pin que declara la ficha del driver.
  const asignarPin = (pin: string, valor: string) =>
    setFormComp(prev => ({ ...prev, config: { ...prev.config, pines: { ...prev.config.pines, [pin]: valor } } }))
  // Pines que pide el driver; al editar, también los que ya tenía el componente.
  const pinesDelForm = Array.from(new Set([...(catalogo[formComp.config.tipo]?.pines ?? []), ...Object.keys(formComp.config.pines)]))

  // Guarda el componente ingresado usando su nombre como identificador único
  const handleGuardarComponente = () => {
    const nombreLimpio = formComp.nombre.trim()
    if (!nombreLimpio) return

    // El backend puede devolver la configuración sin `componentes` todavía.
    if (hardware.componentes?.[nombreLimpio] && editComp !== nombreLimpio) {
      // En el formulario y no con alert(), que bloquea toda la página, cabecera incluida.
      setErrorComp('Ya existe un componente registrado con este nombre.')
      return
    }

    let parametros: Record<string, unknown>
    try {
      parametros = JSON.parse(parametrosTexto)
      if (!parametros || typeof parametros !== 'object' || Array.isArray(parametros)) throw new Error()
    } catch { setErrorHw('Los parámetros deben ser un objeto JSON válido.'); return }
    if (!catalogo[formComp.config.tipo]) { setErrorHw('Seleccione un driver del catálogo.'); return }
    const sinAsignar = (catalogo[formComp.config.tipo].pines ?? []).filter(pin => !String(formComp.config.pines[pin] ?? '').trim())
    if (sinAsignar.length) { setErrorHw(`Asigne el contacto de: ${sinAsignar.join(', ')}.`); return }
    let nuevoComponente: ComponenteConfig
    try {
      nuevoComponente = armarComponente({
        tipo: formComp.config.tipo,
        pines: formComp.config.pines,
        estado: editComp ? hardware.componentes[editComp].estado : 'Vigente',
        parametros,
        rol: formComp.config.rol,
        ganancia: formComp.config.ganancia,
        offset: formComp.config.offset,
        inhibir_en_prueba: formComp.config.inhibir_en_prueba,
      })
    } catch (e) { setErrorHw((e as Error).message); return }

    setHardware((prev) => ({
      ...prev,
      componentes: {
        ...(prev.componentes ?? {}),
        [nombreLimpio]: nuevoComponente,
      },
    }))

    setFormCompAbierto(false)
    setEditComp(null)
    setErrorHw('')
    setFormComp(NUEVO_COMPONENTE_VACIO)
  }

  // Persiste la estructura final del JSON en el backend Django
  const handleGuardarHardware = async () => {
    setGuardandoHw(true)
    try {
      if (api.guardarHardwareConfig) {
        const respuesta = await api.guardarHardwareConfig(hardware, revisionHw)
        setRevisionHw(respuesta.revision)
        setErrorHw('')
        setGuardadoExito(true)
        setTimeout(() => setGuardadoExito(false), 3000)
      }
    } catch (err) {
      setErrorHw((err as Error).message)
    } finally {
      setGuardandoHw(false)
    }
  }

  // Filtrar componentes según el estado toggle
  const componentesVisibles = Object.entries(hardware.componentes || {}).filter(
    ([_, item]) => mostrarInhabilitados || item.estado === 'Vigente'
  )

  // Al cambiar de pestaña se descarta el formulario abierto: cada uno pertenece a su sección.
  useEffect(() => {
    setShowUsuario(false)
    setUmbralEdit(null)
    setFormCompAbierto(false)
  }, [seccion])

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
      {/* Los formularios ocupan el lugar de la tabla de su sección, sin modal (ADR-0011). */}
      {seccion === 'usuarios' && !showUsuario && (
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

      {seccion === 'usuarios' && showUsuario && (
        <section className="panel form-panel">
          <div className="panel-head">
            <h3>{editId ? `EDITAR USUARIO · ${users.find((u) => u.id === editId)?.usuario ?? ''}` : 'NUEVO USUARIO'}</h3>
          </div>
          <div className="form-grid">
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
          {errorForm && <p className="login-error" style={{ margin: '12px 0 0' }}>{errorForm}</p>}
          <div className="form-actions">
            <button className="ghost" type="button" onClick={cerrarUsuario}>
              Cancelar
            </button>
            <button className="primary" type="button" disabled={!formValido} onClick={guardarUsuario}>
              {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </section>
      )}

      {confirmBaja && (
        <Confirmacion titulo="Dar de baja usuario" confirmar="Dar de baja"
          onConfirmar={darDeBaja} onCancelar={() => setConfirmBaja(null)}>
          <p>
            ¿Seguro que querés dar de baja a <b>{confirmBaja.nombre}</b>? No va a poder ingresar al sistema. No se
            borra: sus ensayos y su historial de auditoría se conservan, y se puede reactivar.
          </p>
        </Confirmacion>
      )}

      {/* ── 2. Sección Hardware ───────────────────────────────────────────── */}
      {seccion === 'hardware' && !formCompAbierto && (
        <section className="panel">
          <p>Guarde la configuración y consulte su aplicación en Control manual.
            Los cambios se aplican con las salidas detenidas y la cola vacía.</p>
          {modoSimulado && <p className="aviso-ctrl">El controlador está en modo simulado: los componentes
            de esta configuración se aplican solo con el hardware GPIO (la Raspberry o su simulador).</p>}
          {errorHw && <p role="alert" className="login-error">{errorHw}</p>}
          <button type="button" className="ghost" onClick={cargarHardware}>Recargar configuración guardada</button>
          {!blocked && !modoSimulado && <button type="button" className="ghost" onClick={() => {
            hardwareApi.aplicar().catch((e: Error) => setErrorHw(e.message))
          }}>Reintentar aplicación</button>}
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
                      setEditComp(null)
                      setParametrosTexto('{}')
                      setErrorComp(null)
                      setFormCompAbierto(true)
                    }}
                  >
                    + Agregar Componente
                  </button>
                  <button type="button" className="btn-primario ghost" onClick={handleGuardarHardware} disabled={guardandoHw || !revisionHw}>
                    {guardandoHw ? 'Guardando...' : guardadoExito ? 'Guardado; verificar aplicación' : 'Guardar JSON'}
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
                          <button type="button" className="ghost" onClick={() => {
                            setEditComp(nombre)
                            const rolValido = item.rol && rolesPosibles(catalogo[item.tipo]?.campos).includes(item.rol)
                            setFormComp({ nombre, config: { tipo: item.tipo, estado: item.estado,
                              pines: Object.fromEntries(Object.entries(item.pines).map(([k, v]) => [k, String(v)])),
                              parametros: item.parametros ?? {}, rol: rolValido ? item.rol : '', ganancia: item.ganancia ?? 1,
                              offset: item.offset ?? 0, inhibir_en_prueba: item.inhibir_en_prueba ?? false } })
                            setParametrosTexto(JSON.stringify(item.parametros ?? {}, null, 2))
                            setErrorComp(null)
                            setFormCompAbierto(true)
                          }}>Editar</button>
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
      {seccion === 'umbrales' && !umbralEdit && (
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

      {seccion === 'umbrales' && umbralEdit && (
        <section className="panel form-panel">
          <div className="panel-head">
            <h3>EDITAR UMBRAL · {umbralEdit.parametro}</h3>
          </div>
          <div className="form-grid">
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
          <div className="form-actions">
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

      {/* ── Alta y edición de componente, en el lugar de la tabla de hardware ── */}
      {seccion === 'hardware' && formCompAbierto && (
        <section className="panel form-panel">
          <div className="panel-head">
            <h3>{editComp ? `EDITAR COMPONENTE · ${editComp}` : 'AGREGAR COMPONENTE'}</h3>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="comp-nombre">Nombre</label>
              <input id="comp-nombre" type="text" placeholder="Ej: Sensor de temperatura del láser"
                value={formComp.nombre} disabled={!!editComp}
                onChange={(e) => { setErrorComp(null); setFormComp((prev) => ({ ...prev, nombre: e.target.value })) }} />
            </div>
            <div className="field">
              <label htmlFor="comp-driver">Driver</label>
              <select id="comp-driver" value={formComp.config.tipo}
                onChange={(e) => {
                  const tipo = e.target.value
                  const info = catalogo[tipo]
                  setErrorHw('')
                  setFormComp(prev => ({ ...prev, config: { ...prev.config, tipo, rol: '',
                    pines: Object.fromEntries((info?.pines ?? []).map(pin => [pin, ''])) } }))
                  setParametrosTexto(JSON.stringify(info?.parametros ?? {}, null, 2))
                }}>
                <option value="">Seleccione un driver</option>
                {Object.keys(catalogo).map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
            </div>
            {(catalogo[formComp.config.tipo]?.descripcion || catalogo[formComp.config.tipo]?.ayuda) && <p className="field full form-ayuda">
              {catalogo[formComp.config.tipo].descripcion ?? catalogo[formComp.config.tipo].ayuda}</p>}

            {/* Un campo por pin de la ficha: el back exige exactamente esos pines. */}
            {pinesDelForm.map(pin => <div className="field" key={pin}>
              <label htmlFor={`comp-pin-${pin}`}>Pin · {pin}</label>
              <input id={`comp-pin-${pin}`} type="text" placeholder="Ej: 17, GPIO17 o PIN11"
                value={String(formComp.config.pines[pin] ?? '')} onChange={e => asignarPin(pin, e.target.value)} />
            </div>)}
            {formComp.config.tipo && pinesDelForm.length === 0 && <p className="field full form-ayuda">Este driver no usa pines GPIO propios (se conecta por el bus indicado en sus parámetros).</p>}

            <div className="field">
              <label htmlFor="comp-rol">Rol en el dashboard</label>
              <select id="comp-rol" value={formComp.config.rol ?? ''} disabled={!formComp.config.tipo}
                onChange={e => setFormComp(prev => ({ ...prev, config: { ...prev.config, rol: e.target.value } }))}>
                <option value="">Sin rol</option>
                {rolesPosibles(catalogo[formComp.config.tipo]?.campos).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {esRolNumerico(formComp.config.rol) ? <>
              <div className="field">
                <label htmlFor="comp-ganancia">Ganancia</label>
                <input id="comp-ganancia" type="number" step="any" value={formComp.config.ganancia ?? 1}
                  onChange={e => setFormComp(prev => ({ ...prev, config: { ...prev.config, ganancia: e.target.value as unknown as number } }))} />
              </div>
              <div className="field">
                <label htmlFor="comp-offset">Offset</label>
                <input id="comp-offset" type="number" step="any" value={formComp.config.offset ?? 0}
                  onChange={e => setFormComp(prev => ({ ...prev, config: { ...prev.config, offset: e.target.value as unknown as number } }))} />
              </div>
            </> : <p className="field form-ayuda">El rol indica qué tarjeta del dashboard alimenta este componente.</p>}

            <div className="field full">
              <label htmlFor="comp-parametros">Parámetros del driver (JSON)</label>
              <textarea id="comp-parametros" className="mono" rows={5} value={parametrosTexto} onChange={e => setParametrosTexto(e.target.value)} />
            </div>
            <label className="field full form-check">
              <input type="checkbox" checked={!!formComp.config.inhibir_en_prueba}
                onChange={e => setFormComp(prev => ({ ...prev, config: { ...prev.config, inhibir_en_prueba: e.target.checked } }))} />
              Inhibir en modo prueba (en el pre-grabado este componente no se acciona)
            </label>
          </div>

          {(errorComp || errorHw) && <p className="login-error" role="alert" style={{ margin: '12px 0 0' }}>{errorComp || errorHw}</p>}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => { setFormCompAbierto(false); setEditComp(null) }}>
              Cancelar
            </button>
            <button type="button" className="primary" onClick={handleGuardarComponente}>
              Guardar Componente
            </button>
          </div>
        </section>
      )}
    </>
  )
}
