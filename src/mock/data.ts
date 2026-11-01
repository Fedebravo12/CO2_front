// Datos que siguen simulados a propósito. Los ensayos, programas, alertas,
// usuarios, auditoría y umbrales ya vienen del backend (src/api/client.ts).
//
// - El procedimiento guiado de «Nuevo ensayo» ya viene del backend
//   (/api/procedimientos/): cada programa tiene el suyo.
// - TELEMETRIA_BASE: valores de arranque de la telemetría simulada, hasta que
//   exista el canal WebSocket del controlador (M4).

export const VERSION = '1.0.0'

export const TELEMETRIA_BASE = {
  potenciaLaserW: 0,
  potenciaMw: 0,
  tempLaser: 21.4,
  tempRefrigeracion: 18.7,
  caudal: 2.1,
  sensorSombraMw: 0,
  posicionUm: 0,
  voltajeHv: 0,
  frecuenciaHz: 0,
  tiempoPulsoMs: 400,
  periodoS: 0,
  canalesActivos: 10,
  canalesTotales: 10,
  muestreoMs: 1000,
  actualizacionHz: 1,
}
