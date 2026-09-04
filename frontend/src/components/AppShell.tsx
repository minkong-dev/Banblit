import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { MenuIcon, ThemeIcon } from "./icons";
import { usePage } from "./hooks";
import { logOut } from "../lib/pipeline";

// 사이드바 차림. 두 화면이 같은 것을 보여주고, 지금 보는 곳만 다르게 켠다.
const NAV = [
  { key: "schedule", label: "합주실 시간표", to: "/scheduler" },
  { key: "notice", label: "공지사항", to: "/notices" },
  { key: "find-team", label: "팀 찾기", to: "/teams" },
  { key: "board", label: "팀 게시판", to: "/board" },
] as const;

const MANAGER_NAV = [
  { key: "assign", label: "배정 결과 확인", to: "/admin" },
  { key: "settings", label: "합주실·기간 설정", to: "/settings" },
] as const;

export type NavKey = (typeof NAV)[number]["key"] | (typeof MANAGER_NAV)[number]["key"];

type NavItem = { key: string; label: string; to: string | null };

function NavList({ items, current }: { items: readonly NavItem[]; current: NavKey | undefined }) {
  return (
    <nav>
      {items.map((item) =>
        // 아직 만들지 않은 화면은 링크가 아니라 눌리지 않는 글이다.
        item.to === null ? (
          <button key={item.key} type="button" disabled>{item.label}</button>
        ) : (
          <NavLink key={item.key} to={item.to}
            aria-current={item.key === current ? "page" : undefined}>
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}

/** 화면 설정을 따르던 것을 반대쪽으로 한 번 뒤집는다. */
function toggleTheme(): "dark" | "light" {
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const now = document.documentElement.dataset.theme ?? (systemDark ? "dark" : "light");
  const next = now === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  return next;
}

export function AppShell(props: {
  /** 화면 CSS 가 갇혀 있는 이름 — scheduler, admin. */
  page: string;
  /** 사이드바에 없는 화면(프로필 설정)은 아무 항목도 켜지 않도록 비워 둔다. */
  current?: NavKey;
  /** 상단 오른쪽 — 프로필 버튼과, 있다면 그 말풍선까지. */
  profile: ReactNode;
  /** 사이드바 맨 아래에 덧붙일 것. */
  sideExtra?: ReactNode;
  toast?: string;
  children: ReactNode;
}) {
  const { page, current, profile, sideExtra, toast, children } = props;
  usePage(page);

  const [navOpen, setNavOpen] = useState(false);
  const [themeLabel, setThemeLabel] = useState("어두운 화면으로 바꾸기");

  // 사이드바를 여는 표시는 원본 CSS 가 body.navopen 으로 읽는다.
  useEffect(() => {
    document.body.classList.toggle("navopen", navOpen);
    return () => document.body.classList.remove("navopen");
  }, [navOpen]);

  return (
    <>
      <header className="top">
        <div className="in">
          <button className="ic" id="menuBtn" aria-label="메뉴 열기" aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}>
            <MenuIcon />
          </button>
          <div className="logo"><b>Banblit</b><span>IN SIX STRINGS · A실</span></div>
          <button className="ic" aria-label={themeLabel}
            onClick={() => {
              const next = toggleTheme();
              setThemeLabel(next === "dark" ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기");
            }}>
            <ThemeIcon />
          </button>
          {profile}
        </div>
      </header>

      <div className="shell">
        <aside className="side" aria-label="메뉴">
          <div className="inner">
            <NavList items={NAV} current={current} />
            <div className="sep" />
            <div className="cap">헤드매니저</div>
            <NavList items={MANAGER_NAV} current={current} />
            {sideExtra}
          </div>
        </aside>

        <div className="page">{children}</div>
      </div>

      <div className={toast ? "toast on" : "toast"} role="status" aria-live="polite">
        {toast ?? ""}
      </div>
    </>
  );
}

/** 흰 카드 한 장. 안쪽 배치는 각 화면 CSS 가 정한다. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

export function Tabs<T extends string>(props: {
  label: string;
  items: readonly { key: T; text: string }[];
  selected: T;
  onSelect: (key: T) => void;
}) {
  const { label, items, selected, onSelect } = props;
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} className="tab" role="tab"
          aria-selected={item.key === selected} onClick={() => onSelect(item.key)}>
          {item.text}
        </button>
      ))}
    </div>
  );
}

/** 상단 오른쪽 프로필 단추 + 말풍선. 스케줄러·게시판류 화면이 함께 쓴다.
 *  "프로필 설정"이 이 말풍선에서 `/profile`로 들어가는 유일한 자리다. */
export function ProfileMenu(props: {
  name: string;
  sub: string;
  teams: { id: number; name: string; colorKey: string }[];
}) {
  const { name, sub, teams } = props;
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const initial = name.slice(0, 2);

  // 서버 호출이 실패해도 로그인 화면으로는 보낸다 — 표시용 쿠키가 남아 있어도
  // 다음 요청은 401로 거절되니 화면을 붙잡아 둘 이유가 없다.
  async function handleLogOut(): Promise<void> {
    setOpen(false);
    try {
      await logOut();
    } catch {
      // 위 주석대로 실패해도 로그인 화면으로 넘어간다.
    }
    void navigate("/login");
  }

  return (
    <>
      <button className="profbtn" aria-expanded={open} onClick={() => setOpen((on) => !on)}>
        <span className="face" aria-hidden="true">{initial}</span>
        <span className="nm">{name}</span>
        <span className="ar" aria-hidden="true">▾</span>
      </button>
      <div className={open ? "pop on" : "pop"} role="dialog" aria-label="내 프로필">
        <div className="who">
          <span className="face" aria-hidden="true">{initial}</span>
          <div><b>{name}</b><small>{sub}</small></div>
        </div>
        <hr />
        <div className="cap">소속 팀 {teams.length}개</div>
        {teams.map((team) => (
          <div className="tm" key={team.id}>
            <i style={{ background: `var(--${team.colorKey})` }} />{team.name}<small>미연동</small>
          </div>
        ))}
        <hr />
        <button className="act" onClick={() => { setOpen(false); void navigate("/profile"); }}>
          프로필 설정<span>›</span>
        </button>
        <button className="act quit" onClick={() => void handleLogOut()}>로그아웃</button>
      </div>
    </>
  );
}

/** 오른쪽 목록 한 칸. onOpen 이 있으면 머리글이 눌리는 단추가 된다. */
export function Panel(props: {
  title: string;
  hint?: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const { title, hint, onOpen, children } = props;
  const head = <>{title}{hint === undefined ? null : <span>{hint}</span>}</>;
  return (
    <section className="panel">
      {onOpen === undefined
        ? <div className="ph">{head}</div>
        : <button className="ph" onClick={onOpen}>{head}</button>}
      {children}
    </section>
  );
}
