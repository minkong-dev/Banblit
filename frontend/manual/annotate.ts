// 캡쳐한 화면에 강조 표시를 그립니다. 그림 편집기를 쓰지 않고 캡쳐 직전에 화면 위에
// 요소를 추가하는 방식입니다. 그래야 화면이 변경될 때 표시 위치가 함께 따라갑니다.
//
// 표시 4가지
// | 종류      | 무엇을 그리나                                           |
// | box       | 대상의 테두리를 감싸는 사각형. label 을 적으면 모서리에 글상자 |
// | spotlight | 대상만 남기고 바깥 전체를 어둡게                          |
// | badge     | 대상의 왼쪽 위에 번호 원                                 |
// | note      | 대상 옆에 꼬리말 글상자                                  |
import type { Page } from "@playwright/test";

/** 강조 표시 1개입니다. target 은 CSS 선택자이고 Playwright 의 `text=`·`:has-text()` 도 사용할 수 있습니다. */
export type Annotation = {
  type: "box" | "spotlight" | "badge" | "note";
  target: string;
  /** 같은 선택자에 여러 요소가 해당될 때 몇 번째인지입니다. 생략하면 1번째입니다. */
  nth?: number;
  /** box·note 에 적는 글입니다. */
  label?: string;
  /** 대상의 테두리에서 띄우는 간격(px)입니다. 생략하면 box·spotlight 는 6, badge 는 0 입니다. */
  pad?: number;
  /** box·note 의 글상자를 붙이는 방향입니다. 생략하면 위쪽입니다.
   *  badge 는 네 모서리 중 어디에 놓을지로 읽습니다 — 생략하면 왼쪽 위이고,
   *  "right"·"bottom"·"bottom-right" 로 옮깁니다. */
  place?: "top" | "bottom" | "left" | "right" | "bottom-right";
};

type Rect = { x: number; y: number; width: number; height: number };
type Drawn = Annotation & { rect: Rect };

const OVERLAY_ID = "banblit-manual-overlay";
const DEFAULT_PAD = 6;

/** 그림마다 같은 모습이 나오도록 애니메이션과 입력 커서를 멈춥니다. 캡쳐 1장마다 1번 호출합니다. */
export async function freeze(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }`,
  });
}

/** 강조 표시를 그립니다. 선택자에 해당하는 요소가 없으면 그 표시 1개만 건너뛰고 경고를 출력합니다. */
export async function annotate(page: Page, items: Annotation[]): Promise<void> {
  if (items.length === 0) return;
  const drawn: Drawn[] = [];
  for (const item of items) {
    const locator = page.locator(item.target).nth(item.nth ?? 0);
    const rect = await locator.boundingBox().catch(() => null);
    if (rect === null) {
      console.warn(`강조 표시를 건너뜁니다 — 선택자 '${item.target}' 에 해당하는 요소가 없습니다`);
      continue;
    }
    drawn.push({ ...item, rect });
  }
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await page.evaluate(
    ({ items: list, scroll: offset, overlayId, defaultPad }) => {
      const layer = document.createElement("div");
      layer.id = overlayId;
      layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000;";
      document.body.append(layer);

      const put = (css: string, text?: string): HTMLDivElement => {
        const node = document.createElement("div");
        node.style.cssText = `position:absolute;box-sizing:border-box;${css}`;
        if (text !== undefined) node.textContent = text;
        layer.append(node);
        return node;
      };

      // 글자 크기는 화면 기준이 아니라 인쇄 기준입니다. 화면 전체 그림은 매뉴얼에서 가로 131mm 로
      // 줄어들므로, 화면과 같은 크기로 그리면 인쇄물에서 읽을 수 없습니다.
      const LABEL_CSS = "padding:6px 14px;border-radius:9px;background:#e5484d;color:#fff;"
        + "font:700 21px/1.25 'Noto Sans KR',sans-serif;white-space:nowrap;letter-spacing:-0.01em;"
        + "box-shadow:0 2px 8px rgba(0,0,0,0.25);";

      for (const item of list) {
        const pad = item.pad ?? (item.type === "badge" ? 0 : defaultPad);
        const left = item.rect.x + offset.x - pad;
        const top = item.rect.y + offset.y - pad;
        const width = item.rect.width + pad * 2;
        const height = item.rect.height + pad * 2;

        if (item.type === "spotlight") {
          put(`left:${left}px;top:${top}px;width:${width}px;height:${height}px;`
            + "border-radius:10px;box-shadow:0 0 0 9999px rgba(8,10,14,0.62);"
            + "outline:2px solid rgba(229,72,77,0.9);");
          continue;
        }

        if (item.type === "badge") {
          const size = 42;
          // 대상의 왼쪽 위 모서리에 반씩 걸치게 그립니다. 다만 화면 가장자리에 붙은 요소
          // (상단바·사이드바)는 그 자리가 그림 밖이라 번호가 잘립니다. 그림 안으로 당깁니다.
          const limitX = document.documentElement.scrollWidth - size - 2;
          const limitY = document.documentElement.scrollHeight - size - 2;
          // 네 모서리 중 하나를 고릅니다. place 를 적지 않으면 왼쪽 위입니다.
          const corner = item.place ?? "";
          const anchorX = corner.includes("right") ? left + width : left;
          const anchorY = corner.includes("bottom") ? top + height : top;
          const badgeLeft = Math.min(Math.max(2, anchorX - size / 2), limitX);
          const badgeTop = Math.min(Math.max(2, anchorY - size / 2), limitY);
          put(`left:${badgeLeft}px;top:${badgeTop}px;width:${size}px;height:${size}px;`
            + "border-radius:50%;background:#e5484d;color:#fff;display:flex;align-items:center;"
            + "justify-content:center;font:700 24px/1 'Noto Sans KR',sans-serif;"
            + "box-shadow:0 2px 8px rgba(0,0,0,0.35);", item.label ?? "");
          continue;
        }

        if (item.type === "box") {
          put(`left:${left}px;top:${top}px;width:${width}px;height:${height}px;`
            + "border:4px solid #e5484d;border-radius:10px;");
        }

        if (item.label === undefined) continue;

        const label = put(LABEL_CSS);
        label.textContent = item.label;
        // 글상자의 크기는 글자가 들어간 뒤에 결정됩니다. 그래서 먼저 추가하고 위치를 잡습니다.
        const box = label.getBoundingClientRect();
        const place = item.place ?? "top";
        const gap = 6;
        const position = {
          top: { left, top: top - box.height - gap },
          bottom: { left, top: top + height + gap },
          left: { left: left - box.width - gap, top: top + height / 2 - box.height / 2 },
          right: { left: left + width + gap, top: top + height / 2 - box.height / 2 },
        }[place];
        // 화면 밖으로 나가면 반대쪽에 붙이거나 안으로 당깁니다. 잘린 글상자는 읽을 수 없습니다.
        const pageW = document.documentElement.scrollWidth;
        const pageH = document.documentElement.scrollHeight;
        const fixedTop = Math.min(
          position.top < 0 ? top + height + gap : position.top,
          pageH - box.height - 2,
        );
        const fixedLeft = Math.min(Math.max(2, position.left), pageW - box.width - 2);
        label.style.left = `${fixedLeft}px`;
        label.style.top = `${fixedTop}px`;
      }
    },
    { items: drawn, scroll, overlayId: OVERLAY_ID, defaultPad: DEFAULT_PAD },
  );
}

/** 그린 강조 표시를 모두 삭제합니다. 같은 화면에서 다른 그림을 이어서 캡쳐할 때 호출합니다. */
export async function clearAnnotations(page: Page): Promise<void> {
  await page.evaluate((overlayId) => {
    document.getElementById(overlayId)?.remove();
  }, OVERLAY_ID);
}
