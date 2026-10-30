// Service worker de la PWA: permite instalar la app y que abra rápido.
//
// Nunca guarda datos del equipo: /api y /ws van siempre a la red, así lo que
// se ve en pantalla es telemetría real o el aviso de "sin conexión".
// - Páginas: primero la red; sin red, la última versión guardada de la app.
// - /assets/: llevan hash en el nombre, se guardan la primera vez que se piden.

const CACHE = 'co2-app-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copia = resp.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copia))
          return resp
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (guardada) =>
          guardada ||
          fetch(request).then((resp) => {
            if (resp.ok) {
              const copia = resp.clone()
              caches.open(CACHE).then((c) => c.put(request, copia))
            }
            return resp
          }),
      ),
    )
  }
})
