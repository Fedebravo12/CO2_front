import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useSystem } from '../context/SystemContext'

interface Props {
  titulo: string
  children: ReactNode
  /** Texto del botón que confirma, p. ej. «Eliminar». */
  confirmar: string
  onConfirmar: () => void | Promise<void>
  onCancelar: () => void
  /** `peligro` para acciones destructivas (título y botón en rojo); `neutral` para el resto. */
  tono?: 'peligro' | 'neutral'
}

/**
 * Confirmación de una acción del usuario (ADR-0011). Es el único uso de un modal
 * junto con los avisos del sistema:
 * - el fondo empieza debajo de la cabecera: el estado y la parada de emergencia
 *   siguen visibles y operables;
 * - el foco arranca en «Cancelar», Escape cancela y al cerrar el foco vuelve
 *   a donde estaba;
 * - si el equipo pasa a emergencia, se cancela sola: la acción pendiente nunca
 *   se aplica después de una parada.
 */
export function Confirmacion({ titulo, children, confirmar, onConfirmar, onCancelar, tono = 'peligro' }: Props) {
  const { estado } = useSystem()
  const [enviando, setEnviando] = useState(false)
  const id = useId()
  const cancelar = useRef(onCancelar)
  cancelar.current = onCancelar
  const estadoAnterior = useRef(estado)
  // Se toma en el primer render: en el efecto, autoFocus ya movió el foco a «Cancelar».
  const [previo] = useState(() => document.activeElement as HTMLElement | null)

  useEffect(() => {
    const anterior = estadoAnterior.current
    estadoAnterior.current = estado
    if (estado === 'EMERGENCIA' && anterior !== 'EMERGENCIA') cancelar.current()
  }, [estado])

  useEffect(() => {
    // En el documento y no en el diálogo: Escape cancela aunque el foco esté en la cabecera.
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelar.current() }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      if (previo?.isConnected) previo.focus()
    }
  }, [previo])

  const aceptar = async () => {
    if (enviando) return
    setEnviando(true)
    try { await onConfirmar() }
    finally { setEnviando(false) }
  }

  return (
    <div className="modal-bg" onClick={() => onCancelar()}>
      <div className={`modal ${tono === 'neutral' ? 'neutral' : ''}`} role="alertdialog"
        aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-texto`} onClick={(e) => e.stopPropagation()}>
        <h3 id={`${id}-titulo`}>{titulo}</h3>
        <div id={`${id}-texto`}>{children}</div>
        <div className="modal-actions">
          <button className="ghost" type="button" autoFocus onClick={() => onCancelar()}>
            Cancelar
          </button>
          <button className={`primary ${tono === 'peligro' ? 'peligro' : ''}`} type="button" disabled={enviando} onClick={aceptar}>
            {confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
