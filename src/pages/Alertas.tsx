import { useEffect, useState } from 'react'
import { api } from '../mock/api'
import type { Alerta } from '../mock/types'

export function Alertas() {
  const [rows, setRows] = useState<Alerta[]>([])

  useEffect(() => {
    api.listarAlertas().then(setRows)
  }, [])

  return (
    <>
      <h1 className="page-title">Alertas / Eventos</h1>
      <section className="panel">
        <div className="panel-head">
          <h3>HISTORIAL DE ALARMAS Y EMERGENCIAS</h3>
          <span className="pill">{rows.filter((a) => !a.reconocida).length} sin reconocer</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>FECHA</th>
                <th>SEVERIDAD</th>
                <th>ORIGEN</th>
                <th>MENSAJE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const tone = a.severidad === 'critical' ? 'danger' : a.severidad === 'warning' ? 'warn' : 'info'
                return (
                  <tr key={a.id}>
                    <td className="mono">{a.fecha}</td>
                    <td>
                      <span className={`st ${tone}`}>{a.severidad}</span>
                    </td>
                    <td>{a.origen}</td>
                    <td>{a.mensaje}</td>
                    <td>
                      {a.reconocida ? (
                        <span style={{ color: 'var(--dim)' }}>Reconocida</span>
                      ) : (
                        <button
                          className="ghost"
                          type="button"
                          onClick={() =>
                            setRows((all) => all.map((x) => (x.id === a.id ? { ...x, reconocida: true } : x)))
                          }
                        >
                          Reconocer
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
