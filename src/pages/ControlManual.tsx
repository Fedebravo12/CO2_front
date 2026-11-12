import { Fragment, useState } from 'react'
import type { Accion, Falla } from '../api/control'
import { fmt } from '../components/Meters'
import { useSystem } from '../context/SystemContext'

/**
 * Operación manual de los actuadores.
 *
 * Cada interruptor manda un comando al controlador y muestra el estado REAL del
 * actuador, leído de la telemetría: no el que se pidió. Si el controlador
 * rechaza un comando (por ejemplo, encender el láser sin el sistema LISTO), el
 * interruptor no cambia y el motivo aparece arriba.
 */
export function ControlManual() {
  const { rol, estado, controlador: c, controladorVivo, enviar } = useSystem()
  const [modo, setModo] = useState<'relativo' | 'absoluto'>('relativo')
  const [valor, setValor] = useState(100)
  const bloqueado = !controladorVivo || estado === 'EMERGENCIA' || estado === 'GRABANDO'
  const a = controladorVivo ? c?.actuadores : undefined
  const MAX_UM = 300000
  const actualUm = Math.round((c?.variables.POSICION_MOTOR ?? 0) * 1000)
  const mover = (um: number) => enviar('mover_motor', { posicion_mm: Math.min(MAX_UM, Math.max(0, um)) / 1000 })

  const filas: { nombre: string; detalle: string; encendido: boolean; encender: Accion; apagar: Accion }[] = [
    {
      nombre: 'Refrigeración',
      detalle: c ? `${fmt(c.variables.CAUDAL_REFRIGERANTE)} L/min · ${fmt(c.variables.TEMPERATURA_AGUA, 1)} °C` : 'Chiller / caudal',
      encendido: Boolean(a?.refrigeracion),
      encender: 'encender_refrigeracion',
      apagar: 'apagar_refrigeracion',
    },
    {
      nombre: 'Alta tensión',
      detalle: c ? `${fmt(c.variables.TENSION_AT, 1)} kV` : 'Fuente HV',
      encendido: Boolean(a?.alta_tension),
      encender: 'habilitar_at',
      apagar: 'deshabilitar_at',
    },
    {
      nombre: 'Shutter mecánico',
      detalle: a?.shutter_armado ? 'Armado: se puede abrir y cerrar' : 'Desarmado: bloqueado',
      encendido: Boolean(a?.shutter_armado),
      encender: 'armar_shutter',
      apagar: 'desarmar_shutter',
    },
    {
      nombre: 'Láser CO₂',
      detalle: a?.laser ? `${fmt(c?.variables.POTENCIA_LASER ?? 0, 1)} W · lazo cerrado` : 'Requiere el sistema LISTO (RN003)',
      encendido: Boolean(a?.laser),
      encender: 'encender_laser',
      apagar: 'apagar_laser',
    },
  ]

  const simulado = c?.falla !== undefined
  const fallas: { valor: Falla; etiqueta: string; descripcion: string }[] = [
    { valor: 'ninguna', etiqueta: 'Sin fallas', descripcion: 'Funcionamiento normal.' },
    {
      valor: 'sobretemperatura',
      etiqueta: 'Sobretemperatura',
      descripcion: 'El chiller deja de enfriar. Grabando, el agua cruza 28 °C en segundos.',
    },
    {
      valor: 'caudal',
      etiqueta: 'Pérdida de caudal',
      descripcion: 'La bomba pierde caudal. Con alta tensión, dispara la parada de emergencia.',
    },
  ]

  return (
    <>
      <h1 className="page-title">Control manual</h1>
      <p style={{ color: 'var(--muted)', marginTop: -8 }}>
        Operación de actuadores para pruebas de secuencia. El controlador valida cada comando: el
        láser no se enciende si la secuencia no está completa.
      </p>

      {c?.mensaje && controladorVivo && <p className={`aviso-ctrl ${c.mensaje.nivel}`}>{c.mensaje.texto}</p>}

      <div className="cards-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3>ACTUADORES</h3>
          {filas.map((f) => (
            <Fragment key={f.nombre}>
              <div className="control-row">
                <div>
                  <b>{f.nombre}</b>
                  <div style={{ color: 'var(--muted)' }}>{f.detalle}</div>
                </div>
                <button
                  className={`toggle ${f.encendido ? 'on' : ''}`}
                  disabled={bloqueado}
                  onClick={() => enviar(f.encendido ? f.apagar : f.encender)}
                  aria-label={`${f.encendido ? 'Apagar' : 'Encender'} ${f.nombre}`}
                >
                  <i />
                </button>
              </div>
              {f.nombre === 'Shutter mecánico' && (
                <div className="control-row" style={{ paddingLeft: 16 }}>
                  <div>
                    <span>Haz del láser</span>
                    <div style={{ color: 'var(--muted)' }}>
                      {a?.shutter_armado ? 'Abrir y cerrar a mano' : 'Arme el shutter para operarlo'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={!a?.shutter_abierto ? 'primary' : 'ghost'}
                      type="button"
                      disabled={bloqueado || !a?.shutter_armado}
                      onClick={() => enviar('cerrar_shutter')}
                    >
                      Cerrado
                    </button>
                    <button
                      className={a?.shutter_abierto ? 'primary' : 'ghost'}
                      type="button"
                      disabled={bloqueado || !a?.shutter_armado}
                      onClick={() => enviar('abrir_shutter')}
                    >
                      Abierto
                    </button>
                  </div>
                </div>
              )}
            </Fragment>
          ))}
          <div className="control-row">
            <div>
              <b>Sensor de sombra</b>
              <div style={{ color: 'var(--muted)' }}>
                {c?.condiciones.FIBRA_ALINEADA ? 'Fibra alineada' : a?.alineando ? 'Alineando…' : 'Fibra sin alinear'} ·{' '}
                {fmt(c?.extra.sensor_sombra_mw ?? 0)} mW
              </div>
            </div>
            <button className="ghost" type="button" disabled={bloqueado} onClick={() => enviar('alinear_fibra')}>
              Alinear
            </button>
          </div>
          {rol === 'Operador' && (
            <p style={{ color: 'var(--muted)' }}>
              Operador: solo dentro de umbrales preconfigurados. No puede redefinir límites.
            </p>
          )}
        </section>

        <section className="panel">
          <h3>DESPLAZADOR LINEAL</h3>
          <div className="control-row">
            <span>Posición actual</span>
            <b className="mono">{fmt(actualUm, 0)} µm</b>
          </div>

          <div className="control-row">
            <div>
              <b>Tipo de movimiento</b>
              <div style={{ color: 'var(--muted)' }}>
                {modo === 'relativo' ? 'Se suma a la posición actual' : 'Va a una posición fija del recorrido'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={modo === 'relativo' ? 'primary' : 'ghost'} type="button" onClick={() => setModo('relativo')}>
                Relativo
              </button>
              <button className={modo === 'absoluto' ? 'primary' : 'ghost'} type="button" onClick={() => setModo('absoluto')}>
                Absoluto
              </button>
            </div>
          </div>

          <div className="control-row">
            <span>{modo === 'relativo' ? 'Distancia a desplazar (µm)' : 'Posición destino (µm)'}</span>
            <input
              type="number"
              min={0}
              max={MAX_UM}
              step={50}
              value={valor}
              disabled={bloqueado}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isNaN(v)) setValor(Math.min(MAX_UM, Math.max(0, v)))
              }}
              style={{
                width: 110,
                background: 'var(--panel-dark, #1a1a1a)',
                color: 'var(--manual-text, #fff)',
                border: '1px solid var(--muted)',
                borderRadius: 6,
                padding: '4px 8px',
              }}
            />
          </div>

          {modo === 'relativo' ? (
            <>
              <div className="control-row">
                <span style={{ color: 'var(--muted)' }}>
                  Quedaría en {fmt(Math.min(MAX_UM, actualUm + valor), 0)} µm (avanzando) o{' '}
                  {fmt(Math.max(0, actualUm - valor), 0)} µm (retrocediendo)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="ghost" type="button" disabled={bloqueado || valor === 0} onClick={() => mover(actualUm - valor)}>
                  − Retroceder
                </button>
                <button className="ghost" type="button" disabled={bloqueado || valor === 0} onClick={() => mover(actualUm + valor)}>
                  + Avanzar
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="ghost" type="button" disabled={bloqueado} onClick={() => mover(valor)}>
                Ir a {fmt(valor, 0)} µm
              </button>
            </div>
          )}

          <div className="control-row" style={{ marginTop: 16 }}>
            <div>
              <b>Referencia</b>
              <div style={{ color: 'var(--muted)' }}>Vuelve al origen del recorrido (0 µm)</div>
            </div>
            <button className="ghost" type="button" disabled={bloqueado} onClick={() => mover(0)}>
              Ir a posición inicial
            </button>
          </div>
        </section>

        {simulado && (
          <section className="panel">
            <h3>SIMULACIÓN DE FALLAS</h3>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              Solo con el hardware simulado. Sirve para probar la respuesta del sistema: alertas,
              parada de emergencia y tiempo de respuesta (RNF001).
            </p>
            {fallas.map((f) => (
              <div key={f.valor} className="control-row">
                <div>
                  <b>{f.etiqueta}</b>
                  <div style={{ color: 'var(--muted)' }}>{f.descripcion}</div>
                </div>
                <button
                  className={c?.falla === f.valor ? 'primary' : 'ghost'}
                  type="button"
                  disabled={!controladorVivo}
                  onClick={() => enviar('inyectar_falla', { falla: f.valor })}
                >
                  {c?.falla === f.valor ? 'Activa' : 'Activar'}
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  )
}
