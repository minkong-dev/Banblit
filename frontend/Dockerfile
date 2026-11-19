# 배포용 화면 Docker image 입니다. build stage 가 Vite build 를 실행하고, prod stage 는 Caddy 가 결과를 제공합니다.
# docker-compose.yml 의 caddy service 가 build 합니다. Caddy 설정 deploy/Caddyfile 도 prod stage 가 복사합니다.

FROM node:24-alpine AS build
WORKDIR /app
# package.json 과 package-lock.json 만 먼저 복사합니다. 소스만 변경된 경우 npm ci layer 는 cache 를 씁니다.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# index.html 의 og:url, og:image 에 들어가는 절대 주소입니다. build 시점에 치환되므로 build arg 로 받습니다.
ARG VITE_APP_ORIGIN
ENV VITE_APP_ORIGIN=${VITE_APP_ORIGIN}
RUN npm run build

FROM caddy:2.11-alpine AS prod
COPY --from=build /app/dist /srv
# deploy 는 docker-compose.yml 의 additional_contexts 가 전달하는 deploy 폴더입니다.
COPY --from=deploy Caddyfile /etc/caddy/Caddyfile
