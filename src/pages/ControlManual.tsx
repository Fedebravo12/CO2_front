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
        máquina de estados no valida el orden (RF008 / RN001–RN003).
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
            <span>Posición {pos} µm</span>
            <input
              type="range"
              min={0}
              max={10000}
              step={50}
              value={pos}
              disabled={locked}
              onChange={(e) => setPos(Number(e.target.value))}
            />
          </div>
          <p style={{ color: 'var(--muted)' }}>
            Recorrido simulado 0–10 000 µm. En hardware real el comando viaja por la API de la
            Raspberry Pi 5.
          </p>
          <button className="ghost" type="button" disabled={locked} onClick={() => setPos(0)}>
            Ir a posición inicial
          </button>
        </section>
      </div>
    </>
  )
}
