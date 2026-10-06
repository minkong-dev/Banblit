# 사용자 매뉴얼 — 고치는 방법

PDF 는 `Banblit-사용자-매뉴얼.pdf` 이고 **A4 가로**로 출력됩니다. 이 폴더의 파일 3개가 그 PDF 를 만듭니다.

| 파일 | 담당 | 무엇을 고칠 때 |
|---|---|---|
| `manual.html` | 글 | 문장·제목·표·번호 설명을 수정할 때 |
| `shots.json` | 그림 | 그림을 추가·삭제하거나 강조 표시를 옮길 때 |
| `theme.css` | 서식 | 글자 크기·여백·색을 수정할 때 |

`shots/` 는 캡쳐 결과입니다. 직접 수정하지 않습니다 — 다시 캡쳐하면 덮어씁니다.
`fonts/` 는 PDF 의 본문 글꼴(Pretendard)입니다.

## 글꼴 2가지

| 어디 | 글꼴 | 이유 |
|---|---|---|
| 그림 안 | Noto Sans KR | 화면이 지정하는 글꼴입니다(`frontend/src/styles/base.css`). 다른 글꼴로 대체하면 그림의 글자가 실제 화면과 달라집니다. `deploy/manual.Dockerfile` 이 container 에 설치합니다 |
| 매뉴얼 본문 | Pretendard | `fonts/PretendardVariable.woff2` 입니다. `theme.css` 의 `@font-face` 가 읽습니다 |

## 고친 뒤 다시 만들기

명령의 정본은 저장소 루트의 `COMMAND.md` 15장입니다.

| 무엇을 고쳤나 | 실행할 것 |
|---|---|
| `manual.html` 또는 `theme.css` 만 | `COMMAND.md` 15-2 (PDF 만 다시 출력합니다. 10초) |
| `shots.json` | `COMMAND.md` 15-1 의 둘째 줄 (캡쳐부터 다시 합니다. 2분) |
| 그림에 나올 데이터(팀 이름·공지 내용 등) | `frontend/manual/seed.ts` 를 수정하고 `COMMAND.md` 15-1 전체 (4분) |

`manual.html` 은 브라우저로 그대로 열 수 있습니다. 글만 고칠 때는 브라우저에서 새로고침해
확인한 뒤 마지막에 1번만 PDF 로 출력하면 됩니다.


## 글 — manual.html

장(chapter) › 절(topic) › **줄(row)** 구조입니다. 줄 1개가 **그림 1장과 그 그림의 설명**이고,
왼쪽에 그림, 오른쪽에 설명이 놓입니다. 쪽나눔은 줄 사이에서만 일어나므로,
**줄 1개가 쪽 높이를 넘지 않게** 둡니다. 그림이 2장이면 줄을 2개로 나눕니다.

```html
<section class="chapter">
  <h1><span class="no">3</span> 대시보드</h1>

  <section class="topic">
    <h2>3-1 월 보기</h2>
    <p class="path">대시보드 › <b>내 일정</b></p>   <!-- 어디서 하는 작업인지 -->

    <div class="row">
      <figure>
        <img src="shots/10-month-me.png" alt="월 보기 화면">
        <figcaption><b>그림 3-1</b> 월 보기</figcaption>
      </figure>
      <div class="says">
        <p class="lead">한 문장으로 무엇을 하는 화면인지 적습니다.</p>

        <ol class="keys">          <!-- 그림의 번호 표시와 순서가 같아야 합니다 -->
          <li><b>달 이동</b> 이전 달과 다음 달로 이동해요.</li>
        </ol>

        <table>
          <thead><tr><th>항목</th><th>설명</th></tr></thead>
          <tbody><tr><td class="k">범례</td><td>막대 색과 팀을 연결해요.</td></tr></tbody>
        </table>

        <p class="note"><b>주의</b> 집중 합주기간에는 예약할 수 없어요.</p>
      </div>
    </div>
  </section>
</section>
```

쓸 수 있는 조각은 9개입니다.

| 조각 | 쓰임 |
|---|---|
| `<div class="row">` | 그림 1장 + 설명 1벌입니다. 배치의 단위입니다 |
| `<div class="row wide">` | 그림 없이 글만 쪽 폭 전체에 둡니다. 표가 넓을 때 씁니다 |
| `<p class="path">` | 화면 경로입니다. 절 맨 위에 1줄 둡니다 |
| `<p class="lead">` | 그 줄이 무엇인지 1문장입니다 |
| `<figure>` | 그림입니다. 가로로 긴 화면 전체 그림에 씁니다 |
| `<figure class="detail">` | 잘라낸 부분 그림입니다. 원래 크기가 작아 72% 폭으로 표시됩니다 |
| `<figure class="tall">` | 세로로 긴 부분 그림입니다(날짜 창의 카드 1장 등). 높이를 기준으로 맞춥니다 |
| `<ol class="keys">` | 그림의 번호 설명입니다. 번호는 자동으로 붙습니다 |
| `<p class="note">` · `<kbd>` | 주의·조건, 그리고 화면의 글자를 그대로 적을 때 |

새 장을 추가하면 맨 앞 `<nav class="toc">` 의 차례에도 같은 줄을 추가합니다. 차례는 자동으로
만들어지지 않습니다.

## 그림 — shots.json

그림 1장이 `shots` 배열의 항목 1개입니다. `name` 이 곧 파일 이름이고
(`shots/<name>.png`), `manual.html` 이 그 경로로 참조합니다.

```json
{
  "name": "10-month-me",
  "steps": [{ "goto": "/scheduler" }, { "click": "[role=tab]:text-is('예약')" }, { "wait": 600 }],
  "clip": { "target": ".cal", "pad": 12 },
  "annotate": [
    { "type": "box", "target": "[role=tablist]", "label": "모드 탭" },
    { "type": "badge", "target": ".calbar", "label": "1" },
    { "type": "spotlight", "target": ".band" }
  ]
}
```

### 항목

| 이름 | 뜻 |
|---|---|
| `name` | 파일 이름입니다 |
| `auth` | `"none"` 이면 로그인하지 않은 화면을 캡쳐합니다. 생략하면 전체 권한 계정입니다 |
| `continue` | `true` 면 앞 그림의 화면 상태를 그대로 이어 씁니다. 모달을 단계별로 캡쳐할 때 씁니다 |
| `steps` | 캡쳐 전에 수행할 동작입니다 |
| `fullPage` | `true` 면 창 높이가 아니라 내용 전체 높이로 캡쳐합니다. 회원가입처럼 창보다 긴 화면에 씁니다 |
| `clip` | 적으면 그 요소만 잘라낸 확대 그림이 됩니다. `pad` 는 둘레 여백(px)입니다 |
| `annotate` | 강조 표시입니다 |

### clip — 어디부터 어디까지 자를지

`target` 만 적으면 그 요소의 상자가 곧 잘라낼 범위입니다. 내용보다 높이가 큰 요소(날짜 창의
카드처럼 창 높이를 꽉 채우는 요소)는 아래쪽이 빈 채로 잘립니다. 그럴 때 `to` 를 적으면
**`target` 의 왼쪽 위부터 `to` 의 오른쪽 아래까지**가 범위가 됩니다.

```json
"clip": { "target": "dialog.panes section.pane .col", "to": "label[for='offReason']", "pad": 14 }
```

`fullPage` 와 `clip` 은 함께 쓸 수 없습니다. `clip` 이 있으면 그 범위가 곧 잘라낼 높이입니다.

**그림의 가로세로 비율에 맞는 칸을 고릅니다.** 가로로 긴 그림은 `manual.html` 에서
`<div class="row">`(152mm), 세로로 긴 그림은 `<div class="row narrow">`(80mm)입니다.
비율이 어긋나면 그림 옆이 비거나 그림이 쪽 높이를 넘습니다.

### steps 에 쓸 수 있는 동작

| 동작 | 예 |
|---|---|
| 이동 | `{ "goto": "/scheduler" }` |
| 누르기 | `{ "click": "button.profbtn" }` |
| 입력 | `{ "fill": ["#offName", "아르바이트"] }` |
| 선택 | `{ "select": ["select", "index:1"] }` |
| 글 입력(본문 편집기) | `{ "type": [".rt [contenteditable=true]", "본문입니다"] }` |
| 안쪽 스크롤 | `{ "scroll": ["dialog .mbody", 600] }` — 그 요소를 600px 내립니다 |
| 마우스 올리기 | `{ "hover": ".cell" }` |
| 키 입력 | `{ "press": ["input", "Enter"] }` |
| 드래그 | `{ "drag": [".tl", 0.1, 0.45] }` — 요소 높이의 10% 지점부터 45% 지점까지 |
| 기다리기 | `{ "wait": 600 }`, `{ "waitFor": ".card" }` |
| 몇 번째 요소인지 | 같은 동작 안에 `"nth": 1` 을 함께 적습니다 |

### annotate 에 쓸 수 있는 표시

| `type` | 무엇을 그리나 |
|---|---|
| `box` | 대상을 감싸는 빨간 사각형입니다. `label` 을 적으면 모서리에 글상자가 붙습니다 |
| `spotlight` | 대상만 남기고 바깥 전체를 어둡게 합니다. 1장에 1개만 씁니다 |
| `badge` | 대상의 왼쪽 위에 번호 원을 그립니다. `label` 에 번호를 적습니다 |
| `note` | 대상 옆에 글상자만 붙입니다 |

`label` 의 위치는 `place` 로 정합니다 — `top`(기본값)·`bottom`·`left`·`right`.

`badge` 는 같은 `place` 를 **네 모서리 중 어디에 놓을지**로 읽습니다. 생략하면 왼쪽 위이고,
`right`·`bottom`·`bottom-right` 로 옮깁니다. 상단바처럼 화면 가장자리에 붙은 요소의 왼쪽 위는
그림 밖이라, 번호가 그림 안으로 당겨지면서 로고 같은 내용을 가립니다. 그럴 때 모서리를 옮깁니다.
둘레 여백은 `pad` 입니다.

`target` 은 CSS 선택자입니다. `button.profbtn` 처럼 적거나,
`[role=tab]:text-is('예약')`·`button:has-text('저장')` 처럼 화면의 글자로 적을 수 있습니다.
선택자에 해당하는 요소가 없으면 그 표시 1개만 건너뛰고 실행 기록에 경고를 남깁니다.

### 날짜 자리표시자

데이터는 실행한 날을 기준으로 만들어지므로 날짜를 그대로 적지 않습니다.

| 적는 것 | 교체되는 값 |
|---|---|
| `{{d+2}}` | 오늘부터 2일 뒤의 일 숫자. 예: `7` |
| `{{date+2}}` | 같은 날짜의 `2026-10-07` 형식 |

달력 칸을 누를 때 `button.cell:has(span.n:text-is('{{d+2}}'))` 처럼 씁니다.
