// 여러 화면이 같은 그림을 쓴다. 화면마다 SVG 를 다시 적으면 한쪽만 고쳐져 어긋난다.
// 크기는 CSS 가 정하므로 여기서는 모양만 갖는다.

type IconProps = { className?: string };

/** 선으로만 그린 그림의 공통 뼈대. 굵기만 자리마다 다르다. */
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

export function MenuIcon(props: IconProps) {
  return <Stroke width={2} {...props}><path d="M4 7h16M4 12h16M4 17h16" /></Stroke>;
}

/** 랜딩은 선이 조금 더 넓고 얇다. 같은 그림이 아니라 다른 그림이다. */
export function WideMenuIcon(props: IconProps) {
  return <Stroke width={1.6} {...props}><path d="M3 7h18M3 12h18M3 17h18" /></Stroke>;
}

export function ThemeIcon(props: IconProps) {
  return <Stroke width={1.9} {...props}><path d="M21 13a8.5 8.5 0 1 1-10-10 7 7 0 0 0 10 10Z" /></Stroke>;
}

/** 알림 종. 흔들리는 몸통과 아래 추 두 획으로 그린다. */
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

/** 가려진 상태. 뜬 눈에 사선을 그어 지금 안 보인다는 것을 말한다. */
export function EyeOffIcon(props: IconProps) {
  return (
    <Stroke width={2} {...props}>
      <path d="M2 12s3.6-6.5 10-6.5c1.7 0 3.2.4 4.5 1M22 12s-3.6 6.5-10 6.5c-1.7 0-3.2-.4-4.5-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
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

export function CheckIcon(props: IconProps) {
  return <Stroke width={2.6} {...props}><path d="M4 12l6 6L20 6" /></Stroke>;
}

export function ClockIcon(props: IconProps) {
  return (
    <Stroke width={2.2} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Stroke>
  );
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
