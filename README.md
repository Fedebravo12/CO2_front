# CO2_front — Interfaz del sistema de grabado láser

Frontend React + TypeScript + Vite del SCADA para grabar LPGs con láser de CO₂.
Está conectado al [backend CO2_back](https://github.com/FranciscoMontiron/CO2_back)
por API REST y WebSocket. Para probar el circuito completo sin hardware se usa
el laboratorio simulado del backend.

## Levantar el proyecto completo

El **Docker Compose está en el repositorio del back** y levanta ambos proyectos,
MySQL, Redis, el controlador, el servicio de eventos y nginx. No hace falta
instalar Node.js ni Python en la computadora para este modo.

### Requisitos

- Git y Docker con Compose v2 (`docker compose version`).
- En Windows: Docker Desktop abierto, motor WSL2 y contenedores Linux.
- Git Bash con OpenSSL en Windows; shell POSIX con OpenSSL en Linux/macOS.

### 1. Clonar ambos repositorios desde main

Desde una carpeta vacía:

```bash
git clone --branch main https://github.com/FranciscoMontiron/CO2_back.git
git clone --branch main https://github.com/Fedebravo12/CO2_front.git
cd CO2_back
```

Los repositorios deben quedar uno al lado del otro:

```text
proyecto/
├── CO2_back/
└── CO2_front/
```

Si se descargan ZIP, renombrar las carpetas quitando `-main`. Si el front está
en otra ubicación, ajustar `FRONT_DIR` en el `.env` del back.

### 2. Configurar el back y generar el certificado

Desde `CO2_back`, en Git Bash o Linux/macOS:

```bash
cp .env.example .env
```

En PowerShell, el equivalente es `Copy-Item .env.example .env`.
Editar `.env` y cambiar `DJANGO_SECRET_KEY`, `MYSQL_PASSWORD` y
`MYSQL_ROOT_PASSWORD`. Mantener `CONTROLLER_HAL=simulado` y
`FRONT_DIR=../CO2_front`. En una PC Intel/AMD, fijar
`TARGET_PLATFORM=linux/amd64`; para Raspberry Pi 5 o emulación ARM64,
usar `linux/arm64` (más lento bajo emulación).

Generar el certificado desde **Git Bash** en Windows o terminal de Linux/macOS,
siempre dentro de `CO2_back`:

```bash
sh docker/nginx/gen-certs.sh
```

El front en Docker usa rutas relativas y no necesita un `.env` propio.

### 3. Inicializar y levantar todo

Desde `CO2_back` (también funciona en PowerShell):

```bash
docker compose up -d --build --wait mysql redis controller api
docker compose exec api python manage.py migrate
docker compose exec api python manage.py cargar_datos_iniciales --con-ejemplo
docker compose exec api python manage.py collectstatic --noinput
docker compose up -d --build --wait
docker compose ps
```

La base se inicializa antes de arrancar el servicio de eventos.
Abrir **https://localhost:8443/** y aceptar el certificado autofirmado local.

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin` | Administrador |
| `investigador` | `investigador` | Investigador |
| `operador` | `operador` | Operador |

Estos usuarios los crea `--con-ejemplo`; son exclusivamente para demostración.

| Dirección | Uso |
|---|---|
| `https://localhost:8443/` | Sistema completo |
| `https://localhost:8443/api/healthz/` | Estado de MySQL, Redis y controlador |
| `https://localhost:8443/api/docs/` | Documentación de la API |
| `https://localhost:8443/admin/` | Administración de Django |

Para verificar desde PowerShell:

```powershell
curl.exe -k https://localhost:8443/api/healthz/
```

Se espera `estado: "ok"` y las tres dependencias con `ok: true`.
Para detener sin borrar datos: `docker compose stop`. Para volver a levantar:
`docker compose up -d --wait`. Ejecutar esos comandos desde `CO2_back`.
`docker compose down -v` borra la base de datos.

La [guía del back](https://github.com/FranciscoMontiron/CO2_back#puesta-en-marcha)
incluye arquitectura, simulación, actualizaciones y diagnóstico detallado.

## Desarrollar el front con recarga automática

Primero completar la puesta en marcha anterior y dejar el backend funcionando.
Instalar **Node.js 22.12+** con npm. Luego, en otra terminal:

```bash
cd CO2_front
npm ci
npx vite
```

Si la terminal estaba en `CO2_back`, usar `cd ../CO2_front`.
Abrir **http://localhost:5173/** (o el puerto que indique Vite).
El proxy de `vite.config.ts` reenvía `/api` y `/ws` a
`https://localhost:8443`, incluyendo la telemetría en vivo.

Para apuntar a otro puerto o servidor, crear `CO2_front/.env.local`:

```dotenv
VITE_BACKEND_URL=https://localhost:9443
```

Reiniciar Vite después de cambiar esa variable. Si se cambia el puerto HTTPS del
back, ajustar también sus orígenes CSRF/CORS en `.env`. Esta variable configura
el proxy de desarrollo; el front compilado usa el nginx del back.

### Scripts

| Comando | Qué hace |
|---|---|
| `npm ci` | Instala las versiones del lockfile |
| `npx vite` | Inicia Vite directamente; funciona en Windows, Linux y macOS |
| `npm run dev` | En `main`, libera el puerto 5173 con un script de Windows y luego inicia Vite |
| `npm run build` | Verifica TypeScript y genera `dist/` |
| `npm run preview` | Sirve el build local; no configura el proxy del backend |

El script de `npm run dev` en `main` usa `netstat` y `taskkill`: finaliza procesos
que escuchan en el puerto 5173. Para conservar esos procesos o usar Linux/macOS,
usar `npx vite`; Vite puede elegir otro puerto si 5173 está ocupado.
Para probar el build integrado con API y WebSocket, reconstruir el servicio
desde `CO2_back`: `docker compose up -d --build front`.

## Integración y diagnóstico

- `src/api/http.ts`: peticiones y renovación de tokens JWT.
- `src/api/client.ts`: adaptación del contrato del back a las pantallas.
- `src/api/control.ts`: comandos del controlador.
- `src/hooks/useTelemetriaControlador.ts`: conexión a `/ws/telemetria/`.

Si no conecta o no permite ingresar, revisar `docker compose ps` y
`docker compose logs --tail 100 api ws eventos controller nginx` desde el back.
Verificar que se hayan ejecutado las migraciones y la carga de demo.
Si la interfaz muestra **SIN CONEXIÓN AL CONTROLADOR**, revisar `controller`
y `ws`: tener la página abierta no garantiza que llegue telemetría.
Si nginx no arranca, comprobar que se generaron `co2.crt` y `co2.key` en
`CO2_back/docker/nginx/certs/`.
