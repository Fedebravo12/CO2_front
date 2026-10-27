import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  Home,
  LogOut,
  Play,
  Settings,
  SlidersHorizontal,
  MonitorPlay,
  Square,
  User,
} from 'lucide-react'
import { VERSION } from '../mock/data'
import type { EstadoSistema } from '../mock/types'
import { useAuth } from '../context/AuthContext'
import { useSystem, type Conexion } from '../context/SystemContext'

const NAV = [
  { to: '/', label: 'Telemetría', icon: Home, end: true },
  { to: '/nuevo-ensayo', label: 'Nuevo ensayo', icon: Play },
  { to: '/simulador', label: 'Simulador visual', icon: MonitorPlay },
  { to: '/registro', label: 'Historial de registros', icon: ClipboardList },
  { to: '/programas', label: 'Programas de grabado', icon: FolderKanban },
  { to: '/control-manual', label: 'Control manual', icon: SlidersHorizontal },
  { to: '/alertas', label: 'Alertas / Eventos', icon: Bell },
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function claseDeEstado(estado: EstadoSistema) {
  if (estado === 'LISTO') return 'ready'
  if (estado === 'PREPARACIÓN') return 'prep'
  if (estado === 'GRABANDO') return 'run'
  if (estado === 'REPOSO') return 'idle'
  return 'emg' // EMERGENCIA y SIN CONEXIÓN
}

function StatusIcon({ estado }: { estado: EstadoSistema }) {
  const cls = claseDeEstado(estado)
  return (
    <div className={`status-ico ${cls}`}>
      {estado === 'LISTO' ? <Check size={28} /> : <span style={{ fontSize: 22 }}>●</span>}
    </div>
  )
}

function Indicador({ etiqueta, ok }: { etiqueta: string; ok: boolean | null }) {
  const cls = ok == null ? '' : ok ? 'ok' : 'mal'
  const texto = ok == null ? 'verificando…' : ok ? 'conectado' : 'sin conexión'
  return (
    <span title={`${etiqueta}: ${texto}`}>
      <i className={cls} />
      {etiqueta}: {texto}
    </span>
  )
}

function EstadoConexion({ conexion }: { conexion: Conexion }) {
  return (
    <div className="conexion">
      <Indicador etiqueta="Backend" ok={conexion.api} />
      <Indicador etiqueta="Controlador" ok={conexion.controlador} />
    </div>
  )
}

export function AppLayout() {
  const { rol, conexion, estado, emergencia, rearmar, now, controlador, errorComando } = useSystem()
  const { usuario, cerrarSesion } = useAuth()
  const [openAdmin, setOpenAdmin] = useState(false)
  const [confirmEstop, setConfirmEstop] = useState(false)
  const [confirmSalir, setConfirmSalir] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(false)
  const loc = useLocation()
  const adminOpen = openAdmin || loc.pathname.startsWith('/admin')

  const fecha = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`
  const hora = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const statusCls = claseDeEstado(estado)
  const sinConexion = estado === 'SIN CONEXIÓN'

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarCompact ? 'compact' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <button
              type="button"
              className="brand-mark"
              onClick={() => setSidebarCompact(!sidebarCompact)}
              aria-label={sidebarCompact ? 'Expandir menú' : 'Compactar menú'}
              title={sidebarCompact ? 'Expandir menú' : 'Compactar menú'}
            >
              <Settings size={18} />
            </button>
            {!sidebarCompact && <div className="brand-title">Sistema de Grabado Láser</div>}
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''} ${isActive && item.to === '/nuevo-ensayo' ? 'teal' : ''}`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}

          <button className="nav-btn" onClick={() => setOpenAdmin((v) => !v)}>
            <Settings size={18} />
            Administración
            {adminOpen ? <ChevronDown size={16} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
          </button>
          {adminOpen && (
            <div className="nav-sub">
              <NavLink to="/admin/usuarios">Usuarios y roles</NavLink>
              <NavLink to="/admin/umbrales">Umbrales de alerta</NavLink>
              <NavLink to="/admin/auditoria">Log de auditoría</NavLink>
            </div>
          )}
        </nav>

        <div className="sidebar-foot">
          <div className="user-card">
            <div className="user-meta">
              <User size={16} />
              <div>
                <strong>{usuario?.nombre}</strong>
                <span>{rol}</span>
              </div>
            </div>
            <button type="button" onClick={() => setConfirmSalir(true)} aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </div>
          {!sidebarCompact && <EstadoConexion conexion={conexion} />}
          <div className="clock">
            <span>
              {fecha} · {hora}
            </span>
            <span>Versión {VERSION}</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="status-card">
            <div>
              <h2>ESTADO DEL SISTEMA</h2>
              <p className={`status-value ${statusCls}`}>{estado}</p>
            </div>
            <StatusIcon estado={estado} />
          </div>
          <div className="estop-card">
              <span className="estop-label">
                PARADA DE
                <br />
                EMERGENCIA
              </span>
            <button
              className="estop-btn"
              type="button"
              disabled={estado === 'EMERGENCIA' || sinConexion}
              title={sinConexion ? 'Sin conexión al controlador: usar el pulsador físico' : undefined}
              onClick={() => setConfirmEstop(true)}
              aria-label="Parada de emergencia"
            >
              <Square size={22} fill="white" />
            </button>
          </div>
        </header>

        {sinConexion && (
          <div className="banner">
            <span>
              SIN CONEXIÓN AL CONTROLADOR. La telemetría no es actual y los comandos están
              bloqueados. Ante una emergencia, usar el pulsador físico (interlock por hardware).
            </span>
          </div>
        )}

        {estado === 'EMERGENCIA' && controlador?.mensaje && (
          <div className="banner" style={{ background: 'var(--red-dim)' }}>
            <span>{controlador.mensaje.texto}</span>
          </div>
        )}

        {errorComando && (
          <div className="banner">
            <span>{errorComando}</span>
          </div>
        )}

        {estado === 'EMERGENCIA' && (
          <div className="banner">
            <span>
              Emisión del láser y actuadores deshabilitados. Motivo: parada de emergencia (RN005).
            </span>
            <button type="button" onClick={rearmar}>
              Rearmar sistema
            </button>
          </div>
        )}

        <div className="page">
          <Outlet />
        </div>
      </div>

      {confirmEstop && (
        <div className="modal-bg" onClick={() => setConfirmEstop(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmar parada de emergencia</h3>
            <p>
              Se apagará el láser, se detendrán los actuadores y se registrará el evento. Tiempo
              objetivo de respuesta ≤ 500 ms.
            </p>
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setConfirmEstop(false)}>
                Cancelar
              </button>
              <button
                className="primary"
                type="button"
                style={{ background: '#c31220', borderColor: '#ff4d5a' }}
                onClick={() => {
                  emergencia()
                  setConfirmEstop(false)
                }}
              >
                Activar E-Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSalir && (
        <div className="modal-bg" onClick={() => setConfirmSalir(false)}>
          <div
            className="modal neutral"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-salir"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="titulo-salir">Cerrar sesión</h3>
            <p>¿Querés cerrar la sesión de {usuario?.nombre}? Para volver a operar vas a tener que ingresar de nuevo.</p>
            {estado !== 'REPOSO' && estado !== 'SIN CONEXIÓN' && (
              // Cerrar sesión solo borra el token: el controlador sigue con lo que estaba.
              <p className="aviso-ctrl warn">
                El equipo no está en reposo ({estado}). Cerrar sesión no lo apaga ni detiene el grabado.
              </p>
            )}
            <div className="modal-actions">
              <button className="ghost" type="button" autoFocus onClick={() => setConfirmSalir(false)}>
                Cancelar
              </button>
              <button className="primary" type="button" onClick={cerrarSesion}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
