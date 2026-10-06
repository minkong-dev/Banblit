// 로고입니다. CI 가이드(public/CI/BANBLIT_CI_GUIDE.pdf) 02 LOCKUP 의 A(수평)이고,
// 심볼 파일과 워드마크 글자를 함께 그립니다.
//
// 담는 상자는 이 부품이 만들지 않습니다. 상단바·계정 화면·랜딩 화면이 각자 다른 크기와 색으로
// 로고를 그리는데, 그 셋은 서로 격리된 CSS(shell.css·account.css·landing.css)라 상자를 여기서
// 정하면 세 곳 중 한 곳에서만 맞습니다. 상자와 크기는 쓰는 쪽이 정합니다.
//
// 지켜야 하는 것 3가지(CI 06 RULES)
// - 심볼 최소 크기는 기본형 24px 입니다. 그보다 작게 그려야 하면 단독형(-solo.svg)으로 교체합니다.
// - 워드마크 최소 크기는 가로 72px 입니다. 더 좁은 화면에서는 워드마크를 숨기고 심볼만 남깁니다.
// - 주황 바탕 위에는 기본형을 올리지 않습니다. 단색 크림(-mono-cream.svg)으로 교체합니다.

/** 심볼과 워드마크를 순서대로 그립니다. 감싸는 요소 없이 2개를 그대로 내보냅니다. */
export function BrandLockup() {
  return (
    <>
      {/* 심볼은 장식이라 alt 를 비웁니다. 로고를 읽는 이름은 아래 워드마크 글자가 담당합니다. */}
      <img className="mark" src="/CI/banblit-symbol.svg" alt="" />
      {/* i 1글자만 색이 다릅니다. 강세 태그(em)가 아니라 뜻 없는 span 입니다 — 강조할 글자가
          아니라 색만 다른 글자이고, 스크린 리더가 그 글자만 억양을 넣어 읽지 않게 합니다. */}
      <span className="wordmark">banbl<span className="dot">i</span>t</span>
    </>
  );
}
