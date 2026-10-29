const { build } = require('esbuild')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'emergency-test-'))
const output = path.join(temporary, 'bundle.cjs')

// Ejecuta los handlers con estado controlado; no sustituye una prueba de foco en navegador.
;(async () => {
  await build({ entryPoints: ['src/components/AvisoEmergencia.tsx'], bundle: true, platform: 'node', format: 'cjs', outfile: output, plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /context\/SystemContext$/ }, () => ({ path: 'system', namespace: 'fixture' }))
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'fixture' }))
    b.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'portal', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: {
      system: 'export const useSystem = () => globalThis.fixture',
      hooks: 'export const useState = (...a) => globalThis.hooks.useState(...a); export const useRef = () => ({current:null}); export const useEffect = () => {}',
      portal: 'export const createPortal = value => value',
    }[a.path] }))
    b.onResolve({ filter: /^react\// }, a => ({ path: require.resolve(a.path), external: true }))
  } }] })
  const { AvisoEmergencia } = require(output)
  let states = [], index = 0, commands = []
  global.document = { body: {} }
  global.hooks = { useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value }] } }
  global.fixture = { controlador: { mensaje: { texto: 'Parada del operador (56 ms)' } }, controladorVivo: true, errorComando: null, enviar: async command => { commands.push(command); return true } }
  const render = () => { index = 0; return AvisoEmergencia() }
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
  const find = (tree, type, text) => nodes(tree).find(n => n.type === type && (!text || n.props.children === text))
  let tree = render()
  assert.equal(find(tree, 'dialog').props.role, 'alertdialog')
  find(tree, 'button', 'Cerrar aviso').props.onClick()
  assert.equal(commands.length, 0, 'closing must not send a command')
  tree = render()
  assert.ok(!find(tree, 'dialog'))
  find(tree, 'button', 'Ver emergencia').props.onClick()
  tree = render()
  assert.ok(find(tree, 'dialog'))
  find(tree, 'dialog').props.onCancel()
  assert.equal(commands.length, 0, 'Escape must not reset')
  states = []
  global.fixture.controladorVivo = false
  tree = render()
  assert.equal(find(tree, 'button', 'Rearmar sistema').props.disabled, true)
  await find(tree, 'button', 'Rearmar sistema').props.onClick()
  assert.equal(commands.length, 0, 'no reset while disconnected')
  global.fixture.controladorVivo = true
  tree = render()
  await find(tree, 'button', 'Rearmar sistema').props.onClick()
  assert.deepEqual(commands, ['rearmar'])
  tree = render()
  assert.ok(find(tree, 'dialog'), 'HTTP success must not close the emergency')
  assert.ok(nodes(tree).some(n => n.props?.role === 'status'))
  global.fixture.errorComando = 'Rearme rechazado'
  tree = render()
  assert.ok(find(tree, 'p', 'Rearme rechazado'))
  assert.ok(find(tree, 'dialog'))
  console.log('PASS: close/Escape without commands, reopen, disconnected reset blocked, explicit reset, wait for controller and visible errors')
})().finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
