# 매뉴얼 캡쳐·PDF 전용 image 입니다. E2E 가 쓰는 공식 Playwright image 에 한글 글꼴만 추가합니다.
#
# 설치하는 글꼴은 1개, 화면이 지정하는 "Noto Sans KR" 입니다(frontend/src/styles/base.css 의
# font-family 첫 항목). 다른 글꼴로 대체하거나 fontconfig 로 이름을 연결하지 않습니다 —
# 대체하면 캡쳐한 그림의 글자가 실제 화면과 달라집니다.
#
# 태그는 docker-compose.override.yml 의 e2e 서비스와 같은 값이어야 합니다. 두 값이 다르면
# 공용 node_modules(banblit-e2e-modules)의 @playwright/test 판 번호가 image 안의 브라우저와
# 어긋나 브라우저를 다시 내려받습니다.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

# Google Fonts 가 배포하는 가변 글꼴입니다. 파일 1개에 굵기 100~900 이 들어 있어, 화면이 쓰는
# 굵기를 브라우저가 합성하지 않고 그대로 그립니다. 라이선스는 SIL OFL 1.1 입니다.
ADD https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf \
    /usr/share/fonts/truetype/notosanskr/NotoSansKR.ttf

RUN chmod 644 /usr/share/fonts/truetype/notosanskr/NotoSansKR.ttf && fc-cache -f
