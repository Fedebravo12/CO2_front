import type {
  Alerta,
  Auditoria,
  Ensayo,
  PasoProcedimiento,
  Programa,
  Umbral,
  Usuario,
} from './types'

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

export const PROGRAMAS: Programa[] = [
  {
    id: 'prg-a',
    nombre: 'Programa A',
    potenciaObjetivoMw: 10,
    duracionPulsoMs: 400,
    desplazamientoUm: 550,
    criterioFin: 'Distancia total',
    distanciaMm: 10,
    pulsosEstimados: 182,
    creadoPor: 'Administrador',
    actualizado: '02/05/2025 16:10',
  },
  {
    id: 'prg-b',
    nombre: 'Programa B',
    potenciaObjetivoMw: 8,
    duracionPulsoMs: 350,
    desplazamientoUm: 400,
    criterioFin: 'Distancia total',
    distanciaMm: 8,
    pulsosEstimados: 200,
    creadoPor: 'Administrador',
    actualizado: '18/04/2025 11:22',
  },
  {
    id: 'prg-c',
    nombre: 'Programa C',
    potenciaObjetivoMw: 12,
    duracionPulsoMs: 500,
    desplazamientoUm: 600,
    criterioFin: 'Cantidad de pulsos',
    distanciaMm: 15,
    pulsosEstimados: 250,
    creadoPor: 'Investigador',
    actualizado: '28/04/2025 09:05',
  },
]

const operadores = ['Operador', 'M. Alvarez', 'L. Pérez', 'Investigador']
const programasNombres = PROGRAMAS.map((p) => p.nombre)
const errores = ['Fallo lazo láser', 'Corte de energía', 'Sobretemperatura', 'Pérdida de caudal']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function fechaMock(offsetHoras: number) {
  const d = new Date(2025, 4, 14, 9, 42, 18)
  d.setHours(d.getHours() - offsetHoras)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const ENSAYOS: Ensayo[] = Array.from({ length: 42 }, (_, idx) => {
  const n = 42 - idx
  const r = n % 7
  const estado: Ensayo['estado'] =
    r === 0 ? 'Error' : r === 3 ? 'Interrumpido' : 'Completado'
  const resultado =
    estado === 'Completado' ? 'OK' : estado === 'Interrumpido' ? '—' : errores[n % errores.length]
  const mins = 8 + ((n * 3) % 22)
  const segs = (n * 7) % 60
  return {
    id: `ENS-2025-${String(n).padStart(5, '0')}`,
    fecha: fechaMock(idx * 5),
    programa: programasNombres[n % programasNombres.length],
    operador: operadores[n % operadores.length],
    estado,
    resultado,
    duracion: `00:${pad(mins)}:${pad(segs)}`,
    notas: estado === 'Error' ? resultado : estado === 'Interrumpido' ? 'Parada de emergencia' : 'Ensayo nominal',
  }
})

export const ALERTAS: Alerta[] = [
  {
    id: 'al-01',
    fecha: '14/05/2025 09:18:02',
    severidad: 'warning',
    origen: 'Sensor de sombra',
    mensaje: 'Fibra no alineada. Lectura PD 0.00 mW.',
    reconocida: false,
  },
  {
    id: 'al-02',
    fecha: '13/05/2025 16:44:11',
    severidad: 'critical',
    origen: 'Lazo de control',
    mensaje: 'Potencia fuera de umbral. Se activó parada de emergencia (t < 500 ms).',
    reconocida: true,
  },
  {
    id: 'al-03',
    fecha: '13/05/2025 11:02:40',
    severidad: 'warning',
    origen: 'Refrigeración',
    mensaje: 'Caudal transitoriamente por debajo de 1.8 L/min.',
    reconocida: true,
  },
  {
    id: 'al-04',
    fecha: '12/05/2025 18:21:09',
    severidad: 'info',
    origen: 'Sistema',
    mensaje: 'Ensayo ENS-2025-00038 interrumpido por corte de energía. Último checkpoint persistido.',
    reconocida: true,
  },
  {
    id: 'al-05',
    fecha: '10/05/2025 10:05:33',
    severidad: 'critical',
    origen: 'Alta tensión',
    mensaje: 'Intento de activar láser fuera de secuencia. Comando bloqueado por máquina de estados.',
    reconocida: true,
  },
]

export const USUARIOS: Usuario[] = [
  { id: 'u-1', nombre: 'Operador de turno', usuario: 'operador', rol: 'Operador', activo: true, ultimoAcceso: '14/05/2025 10:24' },
  { id: 'u-2', nombre: 'M. Alvarez', usuario: 'malvarez', rol: 'Investigador', activo: true, ultimoAcceso: '13/05/2025 17:02' },
  { id: 'u-3', nombre: 'L. Pérez', usuario: 'lperez', rol: 'Operador', activo: true, ultimoAcceso: '12/05/2025 09:40' },
  { id: 'u-4', nombre: 'Admin CIOp', usuario: 'admin', rol: 'Administrador', activo: true, ultimoAcceso: '14/05/2025 08:15' },
  { id: 'u-5', nombre: 'Becario inactivo', usuario: 'becario', rol: 'Operador', activo: false, ultimoAcceso: '02/03/2025 14:11' },
]

export const AUDITORIA: Auditoria[] = [
  { id: 'au-1', fecha: '14/05/2025 10:24:35', usuario: 'operador', accion: 'LOGIN', detalle: 'Inicio de sesión correcto' },
  { id: 'au-2', fecha: '14/05/2025 09:42:18', usuario: 'operador', accion: 'ENSAYO_FIN', detalle: 'ENS-2025-00042 completado · Programa A' },
  { id: 'au-3', fecha: '13/05/2025 16:44:11', usuario: 'sistema', accion: 'E-STOP', detalle: 'Parada de emergencia automática · lazo láser' },
  { id: 'au-4', fecha: '12/05/2025 15:10:00', usuario: 'admin', accion: 'PROGRAMA_ALTA', detalle: 'Se actualizó Programa C' },
  { id: 'au-5', fecha: '11/05/2025 09:01:22', usuario: 'admin', accion: 'UMBRAL', detalle: 'Umbral potencia láser 0–50 W' },
  { id: 'au-6', fecha: '10/05/2025 10:05:33', usuario: 'sistema', accion: 'BLOQUEO', detalle: 'Comando láser fuera de secuencia rechazado' },
]

export const UMBRALES: Umbral[] = [
  { id: 'um-1', parametro: 'Potencia láser', min: 0, max: 50, unidad: 'W', critico: true },
  { id: 'um-2', parametro: 'Temp. láser', min: 10, max: 80, unidad: '°C', critico: true },
  { id: 'um-3', parametro: 'Temp. refrigeración', min: 10, max: 40, unidad: '°C', critico: true },
  { id: 'um-4', parametro: 'Caudal refrigerante', min: 1.8, max: 5, unidad: 'L/min', critico: true },
  { id: 'um-5', parametro: 'Voltaje alta tensión', min: 0, max: 3000, unidad: 'V', critico: true },
  { id: 'um-6', parametro: 'Sensor de sombra', min: 0, max: 10, unidad: 'mW', critico: false },
  { id: 'um-7', parametro: 'Tiempo de pulso', min: 50, max: 1000, unidad: 'ms', critico: false },
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
