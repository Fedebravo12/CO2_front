import { useState } from 'react'
import { useSystem } from '../context/SystemContext'

export function ControlManual() {
  const { rol, estado } = useSystem()
  const locked = estado === 'EMERGENCIA'
  const [laser, setLaser] = useState(false)
  const [hv, setHv] = useState(false)
  const [shutter, setShutter] = useState(false)
  const [chiller, setChiller] = useState(true)
  const [pos, setPos] = useState(0)
  const [msg, setMsg] = useState('')

  const tryLaser = () => {
    if (locked) return
    if (!hv || !chiller) {
      setMsg('Máquina de estados: el láser no puede activarse si HV o refrigeración no están listos (RN001).')
      return
    }
    setLaser((v) => !v)
    setMsg('')
  }

  return (
    <>
      <h1 className="page-title">Control manual</h1>
      <p style={{ color: 'var(--muted)', marginTop: -8 }}>
        Operación segura de actuadores para pruebas de secuencia. El láser queda inhibido si la
        máquina de estados no valida el orden.
      </p>

      <div className="cards-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3>ACTUADORES</h3>
          <div className="control-row">
            <div>
              <b>Refrigeración</b>
              <div style={{ color: 'var(--muted)' }}>Chiller / caudal</div>
            </div>
            <button className={`toggle ${chiller ? 'on' : ''}`} disabled={locked} onClick={() => setChiller((v) => !v)}>
              <i />
            </button>
          </div>
          <div className="control-row">
            <div>
              <b>Alta tensión</b>
              <div style={{ color: 'var(--muted)' }}>Fuente HV</div>
            </div>
            <button className={`toggle ${hv ? 'on' : ''}`} disabled={locked} onClick={() => setHv((v) => !v)}>
              <i />
            </button>
          </div>
          <div className="control-row">
            <div>
              <b>Shutter mecánico</b>
              <div style={{ color: 'var(--muted)' }}>{shutter ? 'Abierto' : 'Cerrado'}</div>
            </div>
            <button className={`toggle ${shutter ? 'on' : ''}`} disabled={locked} onClick={() => setShutter((v) => !v)}>
              <i />
            </button>
          </div>
          <div className="control-row">
            <div>
              <b>Láser CO₂</b>
              <div style={{ color: 'var(--muted)' }}>Requiere HV + refrigeración</div>
            </div>
            <button className={`toggle ${laser ? 'on' : ''}`} disabled={locked} onClick={tryLaser}>
              <i />
            </button>
          </div>
          {msg && <p style={{ color: 'var(--orange)' }}>{msg}</p>}
          {rol === 'Operador' && (
            <p style={{ color: 'var(--muted)' }}>
              Operador: solo dentro de umbrales preconfigurados. No puede redefinir límites.
            </p>
          )}
        </section>

        <section className="panel">
          <h3>DESPLAZADOR LINEAL</h3>
          <div className="control-row">
            <span>Posición (µm)</span>
            <input
              type="number"
              min={0}
              max={10000}
              step={50}
              value={pos}
              disabled={locked}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isNaN(v)) return
                setPos(Math.min(10000, Math.max(0, v)))
              }}
              style={{
                width: 100,
                background: 'var(--panel-dark, #1a1a1a)',
                color: '#fff',
                border: '1px solid var(--muted)',
                borderRadius: 6,
                padding: '4px 8px',
              }}
            />
          </div>

          <button
            className="ghost"
            type="button"
            disabled={locked}
            onClick={() => setPos(0)}
            style={{ marginTop: 16 }}
          >
            Ir a posición inicial
          </button>
        </section>
      </div>
    </>
  )
}
