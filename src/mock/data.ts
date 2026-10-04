// Datos que siguen simulados a propósito. Los ensayos, programas, alertas,
// usuarios, auditoría y umbrales ya vienen del backend (src/api/client.ts).
//
// - PASOS: el procedimiento guiado de «Nuevo ensayo». Pasará a estar dirigido
//   por la máquina de estados del controlador (M3).
// - TELEMETRIA_BASE: valores de arranque de la telemetría simulada, hasta que
//   exista el canal WebSocket del controlador (M4).

import type { PasoProcedimiento } from './types'

export const VERSION = '1.0.0'

export const FASES = [
  'Preparación',
  'Parámetros',
  'Verificación',
  'Grabado',
  'Finalización',
] as const

export const PASOS: PasoProcedimiento[] = [
  {
    id: 1,
    titulo: 'Montaje y conexiones',
    subtitulo: 'Fibra e interrogador óptico',
    fase: 0,
    descripcion: 'Monte la fibra en el arreglo y conecte el interrogador óptico.',
    instrucciones: [
      'Colocar la fibra en el arreglo de grabado y tensarla sin exceder el límite mecánico.',
      'Conectar el interrogador óptico al puerto del arreglo y verificar el enlace.',
      'Confirmar que la comunicación óptica se establece antes de continuar.',
    ],
    hardware: [
      { id: 'fibra', nombre: 'Fibra montada', estado: 'PENDIENTE', tono: 'warn' },
      { id: 'interrogador', nombre: 'Interrogador óptico', estado: 'DESCONECTADO', tono: 'danger' },
    ],
    validaciones: [
      { id: 'v1', label: 'Fibra posicionada y bajo tensión', verificada: false },
      { id: 'v2', label: 'Interrogador óptico conectado', verificada: false },
      { id: 'v3', label: 'Comunicación establecida', verificada: false },
    ],
  },
  {
    id: 2,
    titulo: 'Refrigeración',
    subtitulo: 'Estabilización térmica del láser',
    fase: 0,
    descripcion: 'Encienda el equipo de refrigeración y espere a que la temperatura se estabilice.',
    instrucciones: [
      'Activar el circuito de refrigeración del láser de CO₂.',
      'Verificar caudal de refrigerante dentro de 1.8–3.0 L/min.',
      'Esperar temperatura de refrigeración estable (~18–22 °C) antes de habilitar alta tensión.',
    ],
    hardware: [
      { id: 'chiller', nombre: 'Chiller', estado: 'APAGADO', tono: 'neutral' },
      { id: 'caudal', nombre: 'Caudal', estado: 'SIN FLUJO', tono: 'warn' },
    ],
    validaciones: [
      { id: 'v1', label: 'Refrigeración encendida', verificada: false },
      { id: 'v2', label: 'Caudal dentro de umbral', verificada: false },
      { id: 'v3', label: 'Temperatura estabilizada', verificada: false },
    ],
  },
  {
    id: 3,
    titulo: 'Parámetros base',
    subtitulo: 'Configuración del programa de grabado',
    fase: 1,
    descripcion: 'Revise y confirme los parámetros del programa seleccionado antes de energizar el arreglo.',
    instrucciones: [
      'Seleccionar el programa de grabado (o crear uno si el rol lo permite).',
      'Verificar potencia objetivo, duración de pulso y desplazamiento por pulso.',
      'Definir el criterio de finalización (distancia total o cantidad de pulsos).',
    ],
    hardware: [
      { id: 'programa', nombre: 'Programa cargado', estado: 'Programa A', tono: 'ok' },
      { id: 'criterio', nombre: 'Criterio de fin', estado: '10.00 mm', tono: 'info' },
    ],
    validaciones: [
      { id: 'v1', label: 'Programa seleccionado y válido', verificada: false },
      { id: 'v2', label: 'Parámetros dentro de umbrales de seguridad', verificada: false },
      { id: 'v3', label: 'Criterio de finalización definido', verificada: false },
    ],
  },
  {
    id: 4,
    titulo: 'Fuente de alta tensión',
    subtitulo: 'Energización de la fuente HV',
    fase: 2,
    descripcion: 'Encienda la fuente de alta tensión por hardware y software. El semáforo parpadea en amarillo.',
    instrucciones: [
      'Habilitar el interlock físico de la fuente de alta tensión.',
      'Confirmar encendido desde software. El semáforo debe parpadear en amarillo.',
      'Verificar que el voltaje se mantenga en 0 V hasta la activación del láser.',
    ],
    hardware: [
      { id: 'hv-hw', nombre: 'Interlock HV', estado: 'ABIERTO', tono: 'warn' },
      { id: 'hv-sw', nombre: 'Fuente HV (SW)', estado: 'APAGADA', tono: 'neutral' },
    ],
    validaciones: [
      { id: 'v1', label: 'Interlock físico cerrado', verificada: false },
      { id: 'v2', label: 'Fuente HV habilitada por software', verificada: false },
      { id: 'v3', label: 'Semáforo en amarillo intermitente', verificada: false },
    ],
  },
  {
    id: 5,
    titulo: 'Sensor de sombra',
    subtitulo: 'Alineación de la fibra respecto al láser',
    fase: 2,
    descripcion: 'Encienda el sensor de sombra para alinear la fibra. Si no detecta potencia, el láser impacta sobre la fibra.',
    instrucciones: [
      'Activar el fotodetector de sombra (PD).',
      'Alinear la fibra hasta que la lectura de potencia residual sea mínima.',
      'Confirmar estado “Alineado” antes de armar el shutter.',
    ],
    hardware: [
      { id: 'pd', nombre: 'Sensor de sombra', estado: 'NO ALINEADO', tono: 'warn' },
      { id: 'pd-val', nombre: 'Lectura PD', estado: '0.00 mW', tono: 'neutral' },
    ],
    validaciones: [
      { id: 'v1', label: 'Sensor de sombra activo', verificada: false },
      { id: 'v2', label: 'Fibra alineada (potencia residual mínima)', verificada: false },
      { id: 'v3', label: 'Lectura PD dentro de umbral de alineación', verificada: false },
    ],
  },
  {
    id: 6,
    titulo: 'Shutter mecánico',
    subtitulo: 'Brazo que obtura el paso del láser',
    fase: 2,
    descripcion: 'Arme el shutter mecánico. Debe permanecer cerrado hasta el primer pulso del loop de grabado.',
    instrucciones: [
      'Posicionar el brazo mecánico en la trayectoria del haz.',
      'Verificar que el shutter cierre y abra en el tiempo nominal.',
      'Dejar el shutter en estado Cerrado hasta el inicio del loop.',
    ],
    hardware: [
      { id: 'shutter', nombre: 'Shutter', estado: 'DESARMADO', tono: 'warn' },
      { id: 'interlock', nombre: 'Fin de carrera', estado: 'NO DETECTADO', tono: 'neutral' },
    ],
    validaciones: [
      { id: 'v1', label: 'Shutter armado', verificada: false },
      { id: 'v2', label: 'Cierre confirmado por fin de carrera', verificada: false },
      { id: 'v3', label: 'Tiempo de apertura dentro de especificación', verificada: false },
    ],
  },
  {
    id: 7,
    titulo: 'Láser y lazo de control',
    subtitulo: 'Emisión y estabilización de potencia',
    fase: 3,
    descripcion: 'Active el láser y cierre el lazo de control. El semáforo queda en rojo constante.',
    instrucciones: [
      'Confirmar que todos los pasos previos están validados (máquina de estados).',
      'Activar el láser de CO₂. El semáforo debe pasar a rojo fijo.',
      'Cerrar el lazo de control para mantener estable la potencia objetivo.',
    ],
    hardware: [
      { id: 'laser', nombre: 'Láser CO₂', estado: 'APAGADO', tono: 'neutral' },
      { id: 'lazo', nombre: 'Lazo de control', estado: 'ABIERTO', tono: 'warn' },
    ],
    validaciones: [
      { id: 'v1', label: 'Secuencia previa completa', verificada: false },
      { id: 'v2', label: 'Láser encendido', verificada: false },
      { id: 'v3', label: 'Lazo de control cerrado y potencia estable', verificada: false },
    ],
  },
  {
    id: 8,
    titulo: 'Loop de grabado',
    subtitulo: 'Pulsos + desplazamiento lineal',
    fase: 3,
    descripcion: 'Ejecute el loop: pulso (apertura de shutter) y desplazamiento de la fibra hasta el criterio de fin.',
    instrucciones: [
      'Dar un pulso: abrir shutter durante la duración configurada (p. ej. 400 ms).',
      'Desplazar la fibra la distancia configurada (p. ej. 550 µm).',
      'Repetir hasta cumplir el criterio de finalización (distancia total o pulsos).',
    ],
    hardware: [
      { id: 'loop', nombre: 'Loop', estado: 'DETENIDO', tono: 'neutral' },
      { id: 'progreso', nombre: 'Progreso', estado: '0 / 182 pulsos', tono: 'info' },
    ],
    validaciones: [
      { id: 'v1', label: 'Pre-grabado ejecutado (láser inhibido) o omitido a propósito', verificada: false },
      { id: 'v2', label: 'Primer pulso ejecutado correctamente', verificada: false },
      { id: 'v3', label: 'Criterio de finalización alcanzado', verificada: false },
    ],
  },
  {
    id: 9,
    titulo: 'Finalización',
    subtitulo: 'Apagado en orden inverso',
    fase: 4,
    descripcion: 'Deshaga los pasos 1 a 8 en orden inverso y registre el ensayo.',
    instrucciones: [
      'Abrir el lazo y apagar el láser.',
      'Deshabilitar alta tensión, shutter y sensor de sombra.',
      'Apagar refrigeración al final y confirmar que el ensayo quedó persistido.',
    ],
    hardware: [
      { id: 'laser-off', nombre: 'Láser', estado: 'PENDIENTE APAGADO', tono: 'warn' },
      { id: 'registro', nombre: 'Registro de ensayo', estado: 'SIN GUARDAR', tono: 'neutral' },
    ],
    validaciones: [
      { id: 'v1', label: 'Láser y HV apagados', verificada: false },
      { id: 'v2', label: 'Actuadores en posición segura', verificada: false },
      { id: 'v3', label: 'Ensayo registrado en base de datos', verificada: false },
    ],
  },
]

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
