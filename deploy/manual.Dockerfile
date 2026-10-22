# 사용자 설명서 캡처, PDF 전용 Docker image 입니다. E2E 가 쓰는 공식 Playwright Docker image 에 한글 글꼴만 추가합니다.
# 매뉴얼 PDF 의 한글 fallback 글꼴입니다. base.css 의 1순위 글꼴은 Pretendard 이고 Noto Sans KR 은 3순위입니다.
# 태그는 docker-compose.override.yml 의 e2e service 와 같은 값이어야 합니다. 다르면 브라우저를 다시 내려받습니다.
# docker-compose.override.yml 의 manual service 가 build 합니다.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

# Google Fonts 의 가변 글꼴입니다. 파일 1개에 굵기 100~900 이 포함됩니다. 라이선스는 SIL OFL 1.1 입니다.
ADD https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf \
    /usr/share/fonts/truetype/notosanskr/NotoSansKR.ttf

RUN chmod 644 /usr/share/fonts/truetype/notosanskr/NotoSansKR.ttf && fc-cache -f
