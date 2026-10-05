import { useEffect, useRef, useState } from 'react'
import type { TelemetriaControlador } from '../api/control'
import { leerTokens, pedir } from '../api/http'

/**
 * Si no llega telemetría en este tiempo, los datos se consideran congelados.
 * El controlador publica a 1 Hz: 3,5 s son tres mensajes perdidos seguidos.
 */
const DATOS_VENCIDOS_MS = 3500
const ESPERA_MAXIMA_MS = 5000

/**
 * Telemetría en vivo del controlador, por WebSocket (ADR-0003).
 *
 * - Se reconecta sola, con espera creciente, si el canal se corta.
 * - El JWT viaja en la query string (el navegador no permite headers en el
 *   handshake). Antes de cada conexión se consulta `/auth/yo/`: si el token de
 *   acceso venció, esa petición lo renueva y se conecta con el nuevo.
 * - `vivo` pasa a `false` si los datos dejan de llegar, aunque el socket siga
 *   abierto. Lo que nunca puede pasar es mostrar telemetría congelada como si
 *   fuera actual (README, «Integración con el front»).
 */
export function useTelemetriaControlador() {
  const [telemetria, setTelemetria] = useState<TelemetriaControlador | null>(null)
  const [vivo, setVivo] = useState(false)
  const ultimoMensaje = useRef(0)

  useEffect(() => {
    let socket: WebSocket | null = null
    let reintento: ReturnType<typeof setTimeout> | undefined
    let espera = 1000
    let cerrado = false

    const conectar = async () => {
      if (cerrado) return
      try {
        await pedir('/auth/yo/') // renueva el token de acceso si hace falta
      } catch {
        programarReintento()
        return
      }
      const tokens = leerTokens()
      if (!tokens || cerrado) return
      const protocolo = window.location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(
        `${protocolo}://${window.location.host}/ws/telemetria/?token=${encodeURIComponent(tokens.access)}`,
      )
      socket.onopen = () => {
        espera = 1000
      }
      socket.onmessage = (evento) => {
        try {
          setTelemetria(JSON.parse(evento.data) as TelemetriaControlador)
          ultimoMensaje.current = Date.now()
          setVivo(true)
        } catch {
          // Un mensaje mal formado se descarta: el siguiente llega en un segundo.
        }
      }
      socket.onclose = () => {
        socket = null
        programarReintento()
      }
    }

    const programarReintento = () => {
      if (cerrado) return
      reintento = setTimeout(conectar, espera)
      espera = Math.min(espera * 2, ESPERA_MAXIMA_MS)
    }

    const vigilancia = setInterval(() => {
      if (Date.now() - ultimoMensaje.current > DATOS_VENCIDOS_MS) setVivo(false)
    }, 1000)

    conectar()
    return () => {
      cerrado = true
      clearTimeout(reintento)
      clearInterval(vigilancia)
      socket?.close()
    }
  }, [])

  return { telemetria, vivo }
}
