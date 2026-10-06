// 원고(docs/manual/manual.html)를 PDF 로 출력합니다. 브라우저의 인쇄 기능을 그대로 사용하므로
// 사용자가 manual.html 을 브라우저에서 열어 Ctrl+P 로 출력한 결과와 같습니다.
import { test } from "@playwright/test";

import { OUTPUT_PDF, SOURCE_HTML } from "./config";

/** 쪽 여백입니다. 아래쪽만 넓은 이유는 쪽번호가 들어가기 때문입니다. */
const MARGIN = { top: "15mm", right: "16mm", bottom: "16mm", left: "16mm" } as const;

/** 그림이 모두 로드될 때까지 기다리는 시간(ms)입니다. */
const IMAGE_WAIT_MS = 1_500;

const FOOTER = `
<div style="width:100%;padding:0 16mm;font:400 7.5pt sans-serif;color:#9AA1AC;letter-spacing:0.02em;
            display:flex;justify-content:space-between;">
  <span>BANBLIT USER MANUAL</span>
  <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;

test("원고를 PDF 로 출력합니다", async ({ page }) => {
  await page.goto(`file://${SOURCE_HTML}`, { waitUntil: "load" });
  // 인쇄용 스타일(@media print)이 적용된 상태로 출력합니다.
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(IMAGE_WAIT_MS);
  await page.pdf({
    path: OUTPUT_PDF,
    format: "A4",
    // 가로형입니다. 화면 캡쳐가 가로로 긴 그림이라, 세로 쪽에서는 그림 1장이 쪽 폭을 다 쓰고
    // 설명이 그림 아래로 밀립니다. 가로 쪽에서는 그림과 설명을 좌우로 나란히 배치합니다.
    landscape: true,
    printBackground: true,
    margin: MARGIN,
    displayHeaderFooter: true,
    // 머리말은 두지 않습니다. 빈 template 을 주지 않으면 브라우저가 제목과 주소를 넣습니다.
    headerTemplate: "<span></span>",
    footerTemplate: FOOTER,
  });
});
