# ─────────────────────────────────────────────────────────────────────────────
#  Front del Sistema de Grabado Laser — build de produccion
#
#  Etapa 1 compila con Node; etapa 2 sirve los estaticos con nginx. La imagen
#  final no lleva Node ni node_modules: solo HTML, JS y CSS.
#
#  Lo levanta el docker-compose del repo CO2_back, y el nginx de alla lo expone
#  en https://localhost:8443/ junto con la API en /api/ (mismo origen).
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS build
WORKDIR /app

# Primero solo los manifiestos: si no cambian, la capa de `npm ci` se reutiliza
# y el rebuild despues de tocar codigo tarda segundos.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Muestra en el login los usuarios que crea `cargar_datos_iniciales --con-ejemplo`.
# Para una build sin datos de demo: --build-arg VITE_DEMO=0
ARG VITE_DEMO=1
ENV VITE_DEMO=$VITE_DEMO
# `npm run build` corre `tsc --noEmit` antes de Vite: un error de tipos frena la
# imagen, que es justo lo que se quiere.
RUN npm run build


FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
