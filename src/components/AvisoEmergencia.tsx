import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSystem } from '../context/SystemContext'

/** El cierre es solo visual: el controlador conserva el enclavamiento de emergencia. */
export function AvisoEmergencia() {
  const { controlador, controladorVivo, enviar, errorComando } = useSystem()
  const [abierto, setAbierto] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [solicitado, setSolicitado] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

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
    if (!controladorVivo || enviando) return
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
        <h3 id="emergency-title">Parada de emergencia</h3>
        <div id="emergency-description">
          <p>{controlador?.mensaje?.texto || 'El controlador informó una parada de emergencia.'}</p>
          <p>El sistema permanece en emergencia hasta un rearme manual. Cerrar este aviso no rearma el equipo ni reanuda el grabado.</p>
          <p>Verificá y corregí la causa de la parada antes de solicitar el rearme.</p>
        </div>
        {!controladorVivo && <p className="emergency-feedback" role="alert">Sin conexión al controlador. No se puede confirmar el estado actual ni solicitar el rearme. Ante una emergencia, usá el pulsador físico.</p>}
        {errorComando && <p className="emergency-feedback" role="alert">{errorComando}</p>}
        {solicitado && !errorComando && <p role="status">Rearme solicitado. Esperando confirmación del controlador.</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" autoFocus onClick={() => setAbierto(false)}>Cerrar aviso</button>
          <button type="button" className="primary" disabled={!controladorVivo || enviando} onClick={solicitarRearme}>
            {enviando ? 'Solicitando rearme…' : 'Rearmar sistema'}
          </button>
        </div>
      </dialog>, document.body,
    )}
  </>
}
