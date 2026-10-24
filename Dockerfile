FROM node:20-alpine AS build-stage

WORKDIR /app
COPY .npmrc package.json package-lock.json ./
COPY scripts/prepare-valaxy.mjs ./scripts/prepare-valaxy.mjs
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm run check && npm run build && npm run verify:pages

FROM nginx:stable-alpine AS production-stage

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-stage /app/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
