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
  Play,
  Settings,
  SlidersHorizontal,
  Square,
  User,
} from 'lucide-react'
import { VERSION } from '../mock/data'
import type { EstadoSistema, Rol } from '../mock/types'
import { useSystem } from '../context/SystemContext'

const NAV = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/nuevo-ensayo', label: 'Nuevo ensayo', icon: Play },
  { to: '/registro', label: 'Registro de ensayos', icon: ClipboardList },
  { to: '/programas', label: 'Programas de grabado', icon: FolderKanban },
  { to: '/control-manual', label: 'Control manual', icon: SlidersHorizontal },
  { to: '/alertas', label: 'Alertas / Eventos', icon: Bell },
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function StatusIcon({ estado }: { estado: EstadoSistema }) {
  const cls =
    estado === 'LISTO' ? 'ready' : estado === 'PREPARACIÓN' ? 'prep' : estado === 'GRABANDO' ? 'run' : 'emg'
  return (
    <div className={`status-ico ${cls}`}>
      {estado === 'LISTO' ? <Check size={28} /> : <span style={{ fontSize: 22 }}>●</span>}
    </div>
  )
}

export function AppLayout() {
  const { rol, setRol, estado, emergencia, rearmar, now } = useSystem()
  const [openAdmin, setOpenAdmin] = useState(false)
  const [openRole, setOpenRole] = useState(false)
  const [confirmEstop, setConfirmEstop] = useState(false)
  const loc = useLocation()
  const adminOpen = openAdmin || loc.pathname.startsWith('/admin')

  const fecha = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`
  const hora = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const statusCls =
    estado === 'LISTO' ? 'ready' : estado === 'PREPARACIÓN' ? 'prep' : estado === 'GRABANDO' ? 'run' : 'emg'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Settings size={18} />
          </div>
          <div className="brand-title">Sistema de Grabado Láser</div>
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
          <div className="user-card role-menu">
            <div className="user-meta">
              <User size={16} />
              <div>
                <strong>{rol}</strong>
                <span>Cambiar rol (mock)</span>
              </div>
            </div>
            <button type="button" onClick={() => setOpenRole((v) => !v)} aria-label="Cambiar rol">
              <ChevronDown size={16} />
            </button>
            {openRole && (
              <div className="role-pop">
                {(['Operador', 'Investigador', 'Administrador'] as Rol[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRol(r)
                      setOpenRole(false)
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
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
            <h2>PARADA DE EMERGENCIA</h2>
            <button
              className="estop-btn"
              type="button"
              disabled={estado === 'EMERGENCIA'}
              onClick={() => setConfirmEstop(true)}
              aria-label="Parada de emergencia"
            >
              <Square size={22} fill="white" />
            </button>
          </div>
        </header>

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
    </div>
  )
}
