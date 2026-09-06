# Sistema de Grabado Láser

Mockup frontend (React + Vite) del SCADA para el grabado de LPGs con láser de CO₂. Usa datos simulados; la capa lista para conectar la API está en `src/mock/api.ts`.

## Requisitos

- Node.js 20 o superior
- npm 10 o superior

## Levantar el proyecto

```bash
git clone git@github.com:Fedebravo12/CO2_front.git
cd CO2_front
npm install
npm run dev
```

Abrí **http://localhost:5173/**

Si el puerto 5173 está ocupado, `npm run dev` lo libera y arranca Vite.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de producción |
| `npm run preview` | Sirve el build local |

## Rutas

| Pantalla | URL |
|---|---|
| Inicio | `/` |
| Nuevo ensayo | `/nuevo-ensayo` |
| Registro de ensayos | `/registro` |
| Programas de grabado | `/programas` |
| Control manual | `/control-manual` |
| Alertas / Eventos | `/alertas` |
| Administración | `/admin/usuarios` |

## Conectar la API

Reemplazá el cuerpo de las funciones en `src/mock/api.ts` por `fetch('/api/...')` manteniendo las mismas firmas. El estado en vivo (telemetría, E-Stop, paso actual) está en `src/context/SystemContext.tsx`.
