// 매뉴얼 캡쳐·PDF 가 함께 쓰는 값입니다. 경로는 모두 container 안의 경로이고,
// /docs 는 저장소의 docs 폴더입니다(docker-compose.override.yml 의 manual 서비스).

/** 매뉴얼 원고·그림·PDF 가 있는 폴더입니다. */
export const MANUAL_DIR = process.env.MANUAL_DIR ?? "/docs/manual";

/** 캡쳐 사양 파일입니다. 사용자가 이 파일을 수정해 그림과 강조 표시를 변경합니다. */
export const SHOTS_PATH = `${MANUAL_DIR}/shots.json`;

/** 캡쳐한 그림이 저장되는 폴더입니다. 원고가 `shots/<이름>.png` 로 참조합니다. */
export const SHOTS_DIR = `${MANUAL_DIR}/shots`;

/** 매뉴얼 원고입니다. */
export const SOURCE_HTML = `${MANUAL_DIR}/manual.html`;

/** 출력하는 PDF 입니다. */
export const OUTPUT_PDF = `${MANUAL_DIR}/banblit_manual.pdf`;

/** 전체 권한 계정의 로그인 cookie 파일입니다. seed.ts 가 저장하고 캡쳐가 사용합니다. */
export const STATE_PATH = "manual/.auth/manual-account.json";

/** 캡쳐할 때의 창 크기입니다. 사이드바가 접히는 중단점(860px)보다 넓어야 합니다. */
export const VIEWPORT = { width: 1440, height: 900 } as const;

/** 그림의 해상도 배율입니다. 인쇄에서 글자가 흐려지지 않도록 2배로 캡쳐합니다. */
export const SCALE = 2;
