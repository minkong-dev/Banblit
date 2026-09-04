# 배포용 화면 컨테이너 — 묶고(build), 내보낸다(nginx).
# 개발용 Vite 서버는 배포에 가지 않으므로 그 두 일을 여기서 나눠 맡는다.

FROM node:24-alpine AS build
WORKDIR /app
# 꾸러미 목록만 먼저 넣는다. 소스만 바뀐 경우 설치 단계를 다시 돌지 않는다.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
