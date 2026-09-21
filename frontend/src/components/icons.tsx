// 여러 화면이 같은 아이콘을 사용합니다. 화면마다 SVG를 다시 작성하면 한쪽만 수정되어 불일치가 발생합니다.
// 크기는 CSS 가 결정하므로 이 파일에서는 모양만 정의합니다.

type IconProps = { className?: string };

/** 선 아이콘의 공통 컴포넌트입니다. 선 굵기만 아이콘마다 다릅니다. */
function Stroke({ width, children, className }: {
  width: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** 랜딩 페이지 전용 아이콘입니다. 다른 화면의 아이콘과 다른 컴포넌트입니다. */
export function WideMenuIcon(props: IconProps) {
  return <Stroke width={1.6} {...props}><path d="M3 7h18M3 12h18M3 17h18" /></Stroke>;
}

/** 알림 아이콘입니다. */
export function BellIcon(props: IconProps) {
  return (
    <Stroke width={1.9} {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </Stroke>
  );
}

export function CloseIcon(props: IconProps) {
  return <Stroke width={2.2} {...props}><path d="M6 6l12 12M18 6L6 18" /></Stroke>;
}

export function SearchIcon(props: IconProps) {
  return <Stroke width={2.2} {...props}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Stroke>;
}

export function EyeIcon(props: IconProps) {
  return (
    <Stroke width={2} {...props}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Stroke>
  );
}

/** 숨김 상태 아이콘입니다. */
export function EyeOffIcon(props: IconProps) {
  return (
    <Stroke width={2} {...props}>
      <path d="M2 12s3.6-6.5 10-6.5c1.7 0 3.2.4 4.5 1M22 12s-3.6 6.5-10 6.5c-1.7 0-3.2-.4-4.5-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </Stroke>
  );
}

export function PlusIcon(props: IconProps) {
  return <Stroke width={2.2} {...props}><path d="M12 5v14M5 12h14" /></Stroke>;
}

/** 사람 아이콘입니다. 권한 카드에서 그 권한을 가진 멤버 목록을 엽니다. */
export function PersonIcon(props: IconProps) {
  return (
    <Stroke width={2} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
    </Stroke>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Stroke width={2} {...props}>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M14.5 5.5l4 4" />
    </Stroke>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Stroke width={2} {...props}>
      <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Stroke>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return <Stroke width={2.4} {...props}><path d="M15 5l-7 7 7 7" /></Stroke>;
}

export function ChevronRightIcon(props: IconProps) {
  return <Stroke width={2.4} {...props}><path d="M9 5l7 7-7 7" /></Stroke>;
}

export function ClockIcon(props: IconProps) {
  return (
    <Stroke width={2.2} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Stroke>
  );
}

/** 체크 아이콘입니다. 켜고 끄는 자리에 사용합니다.
 *  배치가 밀리지 않게 켠 상태와 끈 상태가 같은 크기의 그림을 사용합니다. */
export function CheckIcon(props: IconProps) {
  return <Stroke width={2.6} {...props}><path d="M4.5 12.5l5 5 10-11" /></Stroke>;
}

export function ArrowIcon(props: IconProps) {
  return <Stroke width={2.2} {...props}><path d="M5 12h14M13 6l6 6-6 6" /></Stroke>;
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" />
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24z" />
      <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.7l3.8-3z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3c.9-2.7 3.4-4.3 6.4-4.3z" />
    </svg>
  );
}

export function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 3C6.9 3 2.8 6.3 2.8 10.3c0 2.6 1.7 4.8 4.3 6.1l-1 3.8c-.1.4.3.7.6.5l4.4-2.9c.3 0 .6.1.9.1 5.1 0 9.2-3.3 9.2-7.6S17.1 3 12 3z" />
    </svg>
  );
}

/** 본문에 링크를 넣는 버튼의 아이콘입니다. 사슬 고리 두 개입니다. */
export function LinkIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M10 13a4 4 0 0 0 5.66 0l3-3A4 4 0 0 0 13 4.34l-1.5 1.5" />
      <path d="M14 11a4 4 0 0 0-5.66 0l-3 3A4 4 0 0 0 11 19.66l1.5-1.5" />
    </Stroke>
  );
}

/** 본문에 그림을 넣는 버튼의 아이콘입니다. */
export function ImageIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m3.5 17 4.5-4.5a2 2 0 0 1 2.8 0L17 19" />
    </Stroke>
  );
}

/** 파일을 첨부하는 버튼의 아이콘입니다. 종이집게입니다. */
export function ClipIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M20 11.5 12.2 19.3a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3" />
    </Stroke>
  );
}

/** 글머리표 목록 버튼의 아이콘입니다. */
export function BulletListIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Stroke>
  );
}

/** 번호 목록 버튼의 아이콘입니다. */
export function NumberListIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M3.4 4.8 4.6 4.2V8M3.4 8h2.4" />
      <path d="M3.4 11.2h2.2L3.4 15h2.4" />
      <path d="M3.4 17h2.2l-1.1 1.4h.3a1.1 1.1 0 1 1-1.2 1.6" />
    </Stroke>
  );
}

/** 실행취소 버튼의 아이콘입니다. */
export function UndoIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M4 9h10a5 5 0 0 1 0 10h-4" />
      <path d="m7.5 5.5-3.5 3.5 3.5 3.5" />
    </Stroke>
  );
}

/** 다시실행 버튼의 아이콘입니다. */
export function RedoIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M20 9H10a5 5 0 0 0 0 10h4" />
      <path d="m16.5 5.5 3.5 3.5-3.5 3.5" />
    </Stroke>
  );
}

/** 문단을 왼쪽으로 정렬하는 버튼의 아이콘입니다. */
export function AlignLeftIcon(props: IconProps) {
  return <Stroke width={1.8} {...props}><path d="M4 6h16M4 10.7h10M4 15.4h13M4 20h8" /></Stroke>;
}

/** 문단을 가운데로 정렬하는 버튼의 아이콘입니다. */
export function AlignCenterIcon(props: IconProps) {
  return <Stroke width={1.8} {...props}><path d="M4 6h16M7 10.7h10M5 15.4h14M8 20h8" /></Stroke>;
}

/** 문단을 오른쪽으로 정렬하는 버튼의 아이콘입니다. */
export function AlignRightIcon(props: IconProps) {
  return <Stroke width={1.8} {...props}><path d="M4 6h16M10 10.7h10M7 15.4h13M12 20h8" /></Stroke>;
}

/** 문단을 양쪽으로 맞추는 버튼의 아이콘입니다. */
export function AlignJustifyIcon(props: IconProps) {
  return <Stroke width={1.8} {...props}><path d="M4 6h16M4 10.7h16M4 15.4h16M4 20h16" /></Stroke>;
}

/** 표를 넣는 버튼의 아이콘입니다. */
export function TableIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M3 15h18M9 4v16M15 4v16" />
    </Stroke>
  );
}

/** 글자에 준 서식을 모두 삭제하는 버튼의 아이콘입니다. 서식 삭제 아이콘입니다. */
export function EraserIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M8.5 19.5 4 15a1.8 1.8 0 0 1 0-2.5l7.5-7.5a1.8 1.8 0 0 1 2.5 0l5 5a1.8 1.8 0 0 1 0 2.5l-7 7z" />
      <path d="M8.5 19.5H20M8.8 8.8l6.4 6.4" />
    </Stroke>
  );
}

/** 제목 문단으로 변경하는 버튼의 아이콘입니다. */
export function HeadingIcon(props: IconProps) {
  return <Stroke width={2} {...props}><path d="M5 5v14M15 5v14M5 12h10M18.5 10.5v8.5" /></Stroke>;
}

/** 인용 문단으로 변경하는 버튼의 아이콘입니다. */
export function QuoteIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M4 5v14" />
      <path d="M9 7h11M9 12h11M9 17h7" />
    </Stroke>
  );
}

/** 코드 블록으로 변경하는 버튼의 아이콘입니다. */
export function CodeIcon(props: IconProps) {
  return <Stroke width={1.8} {...props}><path d="m8.5 8-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4" /></Stroke>;
}

/** 구분선을 넣는 버튼의 아이콘입니다. */
export function RuleIcon(props: IconProps) {
  return <Stroke width={1.8} {...props}><path d="M4 12h16M6 7h12M6 17h12" strokeOpacity="1" /></Stroke>;
}

/** 색을 선택하는 버튼의 아이콘입니다. 아래의 색 막대(.rtcolorbar)가 지금 선택한 색을 표시합니다. */
export function PaletteIcon(props: IconProps) {
  return (
    <Stroke width={1.8} {...props}>
      <path d="M7 15 11.4 5h1.2L17 15" />
      <path d="M8.6 11.5h6.8" />
    </Stroke>
  );
}
