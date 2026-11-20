const { build } = require('esbuild')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hardware-test-'))
const output = path.join(temporary, 'bundle.cjs')

;(async () => {
  // ── useHardwareGpio: una orden por componente y bloqueos ──────────────────
  await build({ entryPoints: ['src/hooks/useHardwareGpio.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: output, plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'fixture' }))
    b.onResolve({ filter: /api\/hardware$/ }, () => ({ path: 'hardware', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: {
      hooks: 'export const useState = (...a) => globalThis.hooks.useState(...a); export const useRef = () => ({current:Date.now()}); export const useEffect = () => {}; export const useId = () => ":r0:"',
      hardware: 'export const hardwareApi = { comando: (...a) => globalThis.command(...a) }',
    }[a.path] }))
  } }] })
  const { useHardwareGpio } = require(output)
  let states = [], index = 0, commands = []
  global.hooks = { useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v }] } }
  global.command = async (...args) => { commands.push(args); return { id: 'cmd-1', estado: 'RECIBIDO' } }
  const hook = () => { index = 0; return useHardwareGpio() }
  const estadoBase = () => ({ revision_aplicada: 'rev1', revision_deseada: 'rev1', cola: 0, capacidad_cola: 32,
    emergencia: false, aplicando: false, resultados: [], componentes: {} })
  hook()
  states[0] = estadoBase()
  let hw = hook()
  assert.equal(hw.conectado, true)
  assert.equal(hw.bloqueado, false)
  await hw.ejecutar('Shutter izquierdo', 'armar')
  assert.deepEqual(commands[0], ['Shutter izquierdo', 'armar', {}, 'rev1'])
  hw = hook()
  assert.ok(hw.pendientes['Shutter izquierdo'])
  await hw.ejecutar('Shutter izquierdo', 'abrir')
  assert.equal(commands.length, 1, 'HTTP acceptance must not permit another order')
  await hw.ejecutar('Láser', 'encender')
  assert.equal(commands.length, 2, 'otro componente sí puede recibir órdenes')
  states[0].emergencia = true
  hw = hook()
  assert.equal(hw.bloqueado, true)
  await hw.ejecutar('Motor', 'detener')
  assert.equal(commands.length, 2, 'en emergencia no se mandan órdenes')
  states[0].emergencia = false
  states[1] = 'Sin conexión'
  hw = hook()
  assert.equal(hw.conectado, false)
  assert.equal(hw.bloqueado, true)
  assert.equal(hw.error, 'Sin conexión')

  // ── Control manual GPIO: el diseño de la pantalla, armado desde los componentes ──
  const vista = path.join(temporary, 'vista.cjs')
  await build({ entryPoints: ['src/pages/ControlManualGpio.tsx'], bundle: true, platform: 'node', format: 'cjs', outfile: vista, plugins: [{ name: 'vista', setup(b) {
    b.onResolve({ filter: /hooks\/useHardwareGpio$/ }, () => ({ path: 'h', namespace: 'vista' }))
    b.onLoad({ filter: /.*/, namespace: 'vista' }, () => ({ contents: 'export const useHardwareGpio = () => { throw new Error("la vista no consulta la red") }' }))
    b.onResolve({ filter: /^react($|\/)|^react-dom($|\/)/ }, a => ({ path: require.resolve(a.path, { paths: [process.cwd()] }), external: true }))
  } }] })
  const React = require(process.cwd() + '/node_modules/react')
  const { renderToStaticMarkup } = require(process.cwd() + '/node_modules/react-dom/server')
  const { ControlManualGpioVista, agruparComponentes } = require(vista)
  const OK = { calidad: 'OK', estado: 'Vigente' }
  const componentes = () => ({
    laser: { ...OK, tipo: 'SALIDA_GPIO', rol: 'LASER', operaciones: { encender: {}, apagar: {} }, valores: { salida_activa: false } },
    shutter: { ...OK, tipo: 'SHUTTER_GPIO', rol: 'SHUTTER', operaciones: { armar: {}, desarmar: {}, abrir: {}, cerrar: {}, pulso: { duracion_ms: 'numero' } }, valores: { armado: false, salida_apertura: false } },
    viejo: { tipo: 'SHUTTER_GPIO', estado: 'Eliminado', operaciones: { abrir: {} } },
    motor_x: { ...OK, tipo: 'STEPPER_DRV8825', rol: 'POSICION_MOTOR', parametros: { unidad: 'mm', minimo: 0, maximo: 300, velocidad_maxima: 5 },
      operaciones: { mover: { delta: 'numero', velocidad: 'numero' }, mover_a: { posicion: 'numero', velocidad: 'numero' }, referenciar: { posicion: 'numero' }, detener: {} },
      valores: { posicion: 0, en_movimiento: false, referenciado: false } },
    termo: { calidad: 'ERROR', estado: 'Vigente', tipo: 'LM35', operaciones: {}, valores: { temperatura_c: 21 } },
  })
  const hwDe = (cambios = {}) => ({ estado: { ...estadoBase(), componentes: componentes() }, conectado: true, bloqueado: false, enviando: null, pendientes: {}, error: '', ejecutar: async () => {}, ...cambios })
  const render = hw => renderToStaticMarkup(React.createElement(ControlManualGpioVista, { hw }))
  // La etiqueta <button ...> de un botón, por aria-label o por su texto.
  const boton = (html, texto) => {
    const i = html.includes(`aria-label="${texto}"`) ? html.indexOf(`aria-label="${texto}"`) : html.indexOf(`>${texto}<`)
    assert.ok(i >= 0, `falta el botón ${texto}`)
    return html.slice(html.lastIndexOf('<button', i), html.indexOf('>', i) + 1)
  }
  const deshabilitado = (html, texto) => /\sdisabled=""/.test(boton(html, texto))

  const grupos = agruparComponentes(componentes())
  assert.deepEqual(grupos.actuadores.map(([n]) => n), ['laser', 'shutter'])
  assert.deepEqual(grupos.motores.map(([n]) => n), ['motor_x'])
  assert.deepEqual(grupos.sensores.map(([n]) => n), ['termo'])

  let html = render(hwDe())
  assert.ok(html.includes('Control manual') && html.includes('ACTUADORES') && html.includes('DESPLAZADOR LINEAL'), 'mismo diseño que con el simulador')
  assert.ok(html.includes('Láser CO₂') && html.includes('Shutter mecánico'), 'nombres por rol')
  assert.ok(!html.includes('viejo'), 'un componente eliminado no se opera')
  assert.equal(deshabilitado(html, 'Activar Láser CO₂'), false)
  assert.equal(deshabilitado(html, 'Abierto'), true, 'no se abre un shutter desarmado')
  assert.equal(deshabilitado(html, 'Disparar'), true)
  assert.equal(deshabilitado(html, '+ Avanzar'), true, 'sin origen declarado no se mueve el eje')
  assert.ok(html.includes('Declare el origen'))
  assert.equal(deshabilitado(html, 'Declarar origen'), false)
  assert.ok(html.includes('Error de lectura'), 'la calidad dudosa se informa')
  assert.ok(!html.includes('21'), 'una lectura con error no se muestra como válida')

  const armado = hwDe()
  armado.estado.componentes.shutter.valores.armado = true
  armado.estado.componentes.motor_x.valores.referenciado = true
  html = render(armado)
  assert.equal(deshabilitado(html, 'Abierto'), false)
  assert.equal(deshabilitado(html, '+ Avanzar'), false)

  html = render({ ...armado, pendientes: { shutter: { id: 'x', desde: Date.now() } } })
  assert.equal(deshabilitado(html, 'Desactivar Shutter mecánico'), true, 'una orden pendiente bloquea ese componente')
  assert.equal(deshabilitado(html, 'Activar Láser CO₂'), false, 'pero no a los demás')
  assert.ok(html.includes('Esperando confirmación'))

  const rechazo = hwDe()
  rechazo.estado.resultados = [{ id: 'r1', componente: 'motor_x', operacion: 'mover', estado: 'RECHAZADO', detalle: 'Declare su posición antes de mover.', ts: new Date().toISOString() }]
  html = render(rechazo)
  assert.ok(html.includes('RECHAZADO: Declare su posición antes de mover.'), 'el motivo del rechazo va en la fila')

  html = render(hwDe({ bloqueado: true, estado: { ...estadoBase(), emergencia: true, componentes: componentes() } }))
  assert.equal(deshabilitado(html, 'Activar Láser CO₂'), true)
  assert.ok(html.includes('Parada enclavada'))
  html = render(hwDe({ conectado: false, bloqueado: true }))
  assert.ok(html.includes('Sin datos vigentes') && html.includes('—'))
  assert.ok(!html.includes('NaN'))

  const nodes = t => !t || typeof t !== 'object' ? [] : Array.isArray(t) ? t.flatMap(nodes) : [t, ...nodes(t.props?.children)]
  // Fichas: el formulario envía los argumentos tipados
  const fb = await build({ entryPoints: ['src/components/FormularioComando.tsx'], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'f2', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'f2' }))
    b.onResolve({ filter: /api\/hardware$/ }, () => ({ path: 'h', namespace: 'f2' }))
    b.onResolve({ filter: /^react\// }, a => ({ path: require.resolve(a.path), external: true }))
    b.onLoad({ filter: /.*/, namespace: 'f2' }, a => ({ contents: a.path === 'h' ? '' : 'export const useState = (...a) => globalThis.hooks.useState(...a); export const useId = () => ":r0:"' }))
  } }] })
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', fb.outputFiles[0].text)(mod, mod.exports, require)
  const { FormularioComando } = mod.exports
  const campo = (t, id) => nodes(t).find(n => n.type === 'input' && n.props.id?.endsWith('-' + id))
  states = []
  let enviado
  const form = args => { index = 0; return FormularioComando({ argumentos: args, onEnviar: v => { enviado = v }, deshabilitado: false, etiqueta: 'Ir' }) }
  const args = { posicion: 'numero', velocidad: 'numero' }
  let f = form(args)
  campo(f, 'posicion').props.onChange({ target: { value: '1.5' } })
  f = form(args)
  campo(f, 'velocidad').props.onChange({ target: { value: '0.5' } })
  f = form(args)
  nodes(f).find(n => n.type === 'button').props.onClick()
  assert.deepEqual(enviado, { posicion: 1.5, velocidad: 0.5 })
  states = []; enviado = undefined
  f = form({})
  nodes(f).find(n => n.type === 'button').props.onClick()
  assert.deepEqual(enviado, {}, 'sin argumentos envía {}')
  states = []; enviado = undefined
  f = form({ n: 'entero', b: 'booleano' })
  nodes(f).find(n => n.type === 'button').props.onClick()
  assert.equal(enviado, undefined, 'argumento numérico vacío no se envía')
  f = form({ n: 'entero', b: 'booleano' })
  campo(f, 'n').props.onChange({ target: { value: '1.5' } })
  f = form({ n: 'entero', b: 'booleano' })
  nodes(f).find(n => n.type === 'button').props.onClick()
  assert.equal(enviado, undefined, 'entero no entero bloqueado')
  f = form({ n: 'entero', b: 'booleano' })
  campo(f, 'n').props.onChange({ target: { value: '3' } })
  f = form({ n: 'entero', b: 'booleano' })
  nodes(f).find(n => n.type === 'button').props.onClick()
  assert.deepEqual(enviado, { n: 3, b: false }, 'booleano sin marcar envía false')
  states = []
  f = form({ n: 'entero', b: 'booleano' })
  assert.equal(campo(f, 'n').props.step, 1)
  assert.equal(campo(f, 'b').props.type, 'checkbox')
  // Administración: componente con rol
  const hb = await build({ entryPoints: ['src/api/hardware.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'f3', setup(b) {
    b.onResolve({ filter: /\/http$/ }, () => ({ path: 'x', namespace: 'f3' }))
    b.onLoad({ filter: /.*/, namespace: 'f3' }, () => ({ contents: 'export const pedir = () => {}' }))
  } }] })
  const hm = { exports: {} }
  new Function('module', 'exports', 'require', hb.outputFiles[0].text)(hm, hm.exports, require)
  const { armarComponente, rolesPosibles } = hm.exports
  const comp = armarComponente({ tipo: 'DS18B20', pines: {}, estado: 'Vigente', parametros: {}, rol: 'TEMPERATURA_AGUA', ganancia: '2', offset: '0.5', inhibir_en_prueba: true })
  assert.equal(comp.rol, 'TEMPERATURA_AGUA'); assert.equal(comp.ganancia, 2); assert.equal(comp.offset, 0.5); assert.equal(comp.inhibir_en_prueba, true)
  assert.ok(!('ganancia' in armarComponente({ tipo: 'X', pines: {}, estado: 'Vigente', parametros: {}, rol: 'LASER', ganancia: 3 })))
  const vacio = armarComponente({ tipo: 'DS18B20', pines: {}, estado: 'Vigente', parametros: {}, rol: 'TEMPERATURA_AGUA', ganancia: '', offset: '  ' })
  assert.ok(!('ganancia' in vacio) && !('offset' in vacio), 'en blanco se omite, nunca 0')
  assert.throws(() => armarComponente({ tipo: 'X', pines: {}, estado: 'Vigente', parametros: {}, rol: 'TEMPERATURA_AGUA', ganancia: 'abc' }))
  assert.deepEqual(rolesPosibles({ armado: 'booleano' }), [])
  assert.deepEqual(rolesPosibles({ temperatura_c: 'numero' }), ['TEMPERATURA_AGUA', 'TEMPERATURA_LASER'])
  console.log('PASS: una orden por componente, bloqueos, diseño de Control manual desde los componentes, fichas y roles')
})().finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
