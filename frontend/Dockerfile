# 배포용 화면 컨테이너 — 묶고(build), 내보낸다(nginx).
# 개발용 Vite 서버는 배포에 가지 않으므로 그 두 일을 여기서 나눠 맡는다.

FROM node:24-alpine AS build
WORKDIR /app
# 꾸러미 목록만 먼저 넣는다. 소스만 바뀐 경우 설치 단계를 다시 돌지 않는다.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 링크 미리보기 태그(index.html 의 og:url·og:image)에 박히는 절대 주소다. 상대 주소로 두면
# 카카오톡·페이스북이 이미지를 받지 못한다. 묶을 때 정해지므로 환경변수가 아니라 build arg 다.
ARG VITE_APP_ORIGIN
ENV VITE_APP_ORIGIN=${VITE_APP_ORIGIN}
RUN npm run build

FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
