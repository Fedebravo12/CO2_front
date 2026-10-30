import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSystem } from '../context/SystemContext'

/** El cierre es solo visual: el controlador conserva el enclavamiento de emergencia. */
export function AvisoEmergencia() {
  const { controlador, controladorVivo, enviar, errorComando, errorTelemetria } = useSystem()
  const [abierto, setAbierto] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [solicitado, setSolicitado] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const emergenciaActiva = controlador?.estado === 'EMERGENCIA'
  const mensaje = controlador?.mensaje
  const avisoControlador = emergenciaActiva || mensaje?.nivel === 'warn' || mensaje?.nivel === 'error'
  const evento = avisoControlador ? `${mensaje?.ts ?? ''}:${mensaje?.texto ?? 'emergencia'}` : null
  const anteriores = useRef<(string | null)[]>([])

  useEffect(() => {
    const actuales = [emergenciaActiva ? 'emergencia' : null, !controladorVivo ? 'desconexion' : null,
      errorComando ? `comando:${errorComando}` : null, errorTelemetria ? `telemetria:${errorTelemetria}` : null, evento]
    // Un aviso nuevo vuelve a llamar la atención; el mismo no reabre cada segundo.
    if (actuales.some(aviso => aviso && !anteriores.current.includes(aviso))) setAbierto(true)
    anteriores.current = actuales
  }, [emergenciaActiva, controladorVivo, errorComando, errorTelemetria, evento])

  useEffect(() => {
    if (!abierto) return
    const node = dialog.current
    const previous = document.activeElement as HTMLElement | null
    node?.showModal()
    return () => {
      node?.close()
      if (previous?.isConnected) previous.focus()
      else trigger.current?.focus()
    }
  }, [abierto])

  const solicitarRearme = async () => {
    if (!emergenciaActiva || !controladorVivo || enviando) return
    setEnviando(true)
    setSolicitado(false)
    try { setSolicitado(await enviar('rearmar')) }
    finally { setEnviando(false) }
    // La aceptación HTTP solo encola el comando. El estado real llega por telemetría.
  }

  return <>
    <button ref={trigger} type="button" className="emergency-details" onClick={() => setAbierto(true)}>
      Ver emergencia
    </button>
    {abierto && createPortal(
      <dialog ref={dialog} className="modal emergency-dialog" role="alertdialog"
        aria-labelledby="emergency-title" aria-describedby="emergency-description"
        onCancel={() => setAbierto(false)}>
        <h3 id="emergency-title">{emergenciaActiva ? 'Parada de emergencia' : 'Avisos del sistema'}</h3>
        <div id="emergency-description">
          {avisoControlador && <p>{mensaje?.texto || 'El controlador informó una parada de emergencia.'}</p>}
          {emergenciaActiva ? <>
            <p>El último estado informado es emergencia. Cerrar este aviso no rearma el equipo ni reanuda el grabado.</p>
            <p>Verificá y corregí la causa de la parada antes de solicitar el rearme manual.</p>
          </> : <p>Cerrar este aviso no modifica el estado del equipo ni envía comandos.</p>}
          {!controladorVivo && <p className="emergency-feedback" role="alert">Sin conexión al controlador. La telemetría no es actual y los comandos están bloqueados. No se puede confirmar el estado del equipo. Ante una emergencia, usá el pulsador físico (interlock por hardware).</p>}
          {errorComando && <p className="emergency-feedback" role="alert">{errorComando}</p>}
          {errorTelemetria && <p className="emergency-feedback" role="alert">{errorTelemetria}</p>}
        </div>
        {solicitado && emergenciaActiva && !errorComando && <p role="status">Rearme solicitado. Esperando confirmación del controlador.</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" autoFocus onClick={() => setAbierto(false)}>Cerrar aviso</button>
          {emergenciaActiva && <button type="button" className="primary" disabled={!controladorVivo || enviando} onClick={solicitarRearme}>
            {enviando ? 'Solicitando rearme…' : 'Rearmar sistema'}
          </button>}
        </div>
      </dialog>, document.body,
    )}
  </>
}
