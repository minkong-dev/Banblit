import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Link } from "react-router-dom";

import { ArrowIcon, CloseIcon, WideMenuIcon } from "../components/icons";
import { usePage } from "../components/hooks";
import "../styles/landing.css";

// 미리보기 달력에 찍는 표시 — 날짜마다 어느 팀이 안 되는지 색 점으로만 보인다.
// 실제 값이 아니라 화면이 어떤 모양인지 보여주는 그림이다.
const MARKS: Record<number, string[]> = {
  3: ["off3"], 5: ["off1"], 9: ["off3"], 11: ["off1", "off2"], 14: ["off1"], 15: ["off2"],
  16: ["off3"], 18: ["off1", "off2"], 21: ["off2"], 23: ["off3"], 25: ["off1"], 26: ["off1", "off2"],
};
const MINI_DAYS = 28;

const BOXES = [
  {
    rail: "자동 배정",
    title: ["전원이 되는 시간을", "사람이 찾지 않습니다"],
    body: "공연 전 집중 합주기간에는 팀마다 합주량이 고르게 돌아가도록 자리를 직접 배정합니다. 팀원 전원이 가능한 시간, 합주실이 비어 있는 시간, 한 사람이 두 팀에 겹치지 않는 것까지 한 번에 계산합니다.",
    num: "0.3초",
    unit: "2주치 일정을 푸는 데 걸린 시간",
  },
  {
    rail: "선착순 예약",
    title: ["먼저 누른 사람이", "가져갑니다"],
    body: "상시 기간에는 30분 단위로, 한 시간대에 한 팀만. 눈치 볼 것 없이 비어 있으면 그냥 누르면 됩니다. 취소도 변경도 그 자리에서 됩니다.",
    num: "12시간",
    unit: "하루에 여는 시간 · 10시부터 22시까지",
  },
  {
    rail: "안 풀릴 때",
    title: ["억지로 잡지 않고", "먼저 알려줍니다"],
    body: "모두가 되는 시간이 없으면 빈 시간표를 내놓지 않습니다. 누구를 빼면 풀리는지 정리해 관리자에게 넘기고, 고르는 것은 사람이 합니다.",
    num: "2회",
    unit: "하루에 다시 계산하는 횟수",
  },
];

const STEPS = [
  {
    k: "STEP 1",
    title: "안 되는 시간을 넣는다",
    body: "달력에서 직접 고르거나 말로 적어도 됩니다. 되는 시간을 서로 맞춰 볼 필요는 없습니다.",
  },
  {
    k: "STEP 2",
    title: "하루 두 번 계산한다",
    body: "정해진 시각에 모든 팀의 자리를 한 번에 계산합니다. 한 사람의 일정이 바뀌어도 다시 돌면 그만입니다.",
  },
  {
    k: "STEP 3",
    title: "확정되면 달력에 뜬다",
    body: "내 팀 일정만 모아 보는 화면에서 바로 확인합니다. 단톡방에 다시 물어볼 일이 없습니다.",
  },
];

/** 화면에 들어온 .rise 요소를 한 번씩만 켠다. 스크롤을 따라 글이 떠오르는 효과. */
function useRiseOnScroll(scope: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const root = scope.current;
    if (root === null) return;

    const observer = new IntersectionObserver(
      (rows) => {
        for (const row of rows) {
          if (!row.isIntersecting) continue;
          row.target.classList.add("in");
          observer.unobserve(row.target);
        }
      },
      { threshold: 0.16 },
    );

    root.querySelectorAll<HTMLElement>(".rise").forEach((element, index) => {
      element.style.transitionDelay = String((index % 3) * 70) + "ms";
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, [scope]);
}

export function Landing() {
  usePage("landing");

  const scope = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openBox, setOpenBox] = useState(0);

  useRiseOnScroll(scope);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  return (
    <div ref={scope}>
      <header className="nav">
        <button className="menu" aria-label="메뉴 열기" onClick={() => setMenuOpen(true)}>
          <WideMenuIcon />
        </button>
        <span className="brand">BANBLIT</span>
        <Link className="login" to="/login">LOGIN</Link>
      </header>

      <nav className={menuOpen ? "sheet on" : "sheet"} aria-label="전체 메뉴">
        <button className="x" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)}>
          <CloseIcon />
        </button>
        <a href="#how" onClick={() => setMenuOpen(false)}>어떻게 쓰나요</a>
        <a href="#auto" onClick={() => setMenuOpen(false)}>자동 배정</a>
        <a href="#admin" onClick={() => setMenuOpen(false)}>운영하는 사람에게</a>
        <Link to="/login" onClick={() => setMenuOpen(false)}>로그인</Link>
      </nav>

      <section className="hero">
        <div>
          <h1>
            합주실 예약, 어렵지 않을 때도 됐으니까.<br />
            지금, <span className="mark">BANBLIT.</span>
          </h1>
          <p className="sub">밴드 여럿이 합주실 하나를 나눠 쓰는 가장 조용한 방법</p>
          <Link className="go" to="/login">시작하기<ArrowIcon /></Link>
        </div>
        <span className="cue">SCROLL</span>
      </section>

      <section className="sec" id="how">
        <div className="wrap stack">
          <div className="shots rise">
            <div className="shot back">
              <div className="mini">
                <div className="mh">9월<span>새벽 네시 · 오프비트</span></div>
                <div className="cal">
                  {Array.from({ length: MINI_DAYS }, (_, i) => i + 1).map((day) => (
                    <div className="d" key={day}>
                      {day}
                      <span style={{ display: "flex", gap: 2 }}>
                        {(MARKS[day] ?? []).map((mark) => <i className={mark} key={mark} />)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="shot front">
              <div className="ttl">안 되는 시간</div>
              <div className="chiprow">
                <span className="chip">화 19:00–22:00</span>
                <span className="chip">수 18:30–21:00</span>
                <span className="chip now">토 종일</span>
              </div>
              <div className="said">
                “화요일 저녁은 학원이라 안 돼”<br />라고 적어도 알아들어요.
              </div>
            </div>
          </div>
          <div className="copy rise">
            <p className="lead">합주 불가능한 시간대만 입력하면,<br />알아서 업데이트 해주니까.</p>
            <p className="lead">일정 정리란 눈치 볼 필요없이,<br />모든 일정을 하나로</p>
          </div>
        </div>
      </section>

      <section id="auto">
        <div className="three">
          {BOXES.map((box, index) => (
            <button
              key={box.rail}
              className={index === openBox ? "box open" : "box"}
              type="button"
              onMouseEnter={() => setOpenBox(index)}
              onFocus={() => setOpenBox(index)}
              onClick={() => setOpenBox(index)}
            >
              <span className="box-rail">{box.rail}</span>
              <span className="full">
                <h3>{box.title[0]}<br />{box.title[1]}</h3>
                <p>{box.body}</p>
                <span className="num">{box.num}</span>
                <span className="unit">{box.unit}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <p className="eyebrow rise">HOW IT WORKS</p>
          <p className="lead rise">부원이 하는 일은 하나입니다.<br />안 되는 시간을 알려주는 것.</p>
          <div className="steps">
            {STEPS.map((step) => (
              <div className="step rise" key={step.k}>
                <div className="bar" />
                <div className="k">{step.k}</div>
                <h4>{step.title}</h4>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec admin" id="admin">
        <div className="wrap row">
          <p className="quote rise">
            합주실 시간표를 손으로 맞추던 사람이<br />이제 <b>승인 버튼만 누릅니다.</b>
          </p>
          <ul className="rise">
            <li><b>합주실</b><span>방마다 운영시간을 정하고, 방을 늘려도 그대로 굴러갑니다</span></li>
            <li><b>기간</b><span>상시 개방과 집중 합주기간, 계산이 도는 시각을 직접 정합니다</span></li>
            <li><b>조율</b><span>못 푼 배정은 선택지로 올라옵니다. 고르는 것은 사람입니다</span></li>
          </ul>
        </div>
      </section>

      <section className="sec end">
        <div className="wrap">
          <h2 className="rise">이번 공연 준비는<br /><span className="mark">BANBLIT</span>으로.</h2>
          <p className="rise">동아리 이름과 합주실 하나면 오늘 바로 시작합니다.</p>
          <Link className="go rise" to="/login">시작하기<ArrowIcon /></Link>
        </div>
      </section>

      <footer>
        <div className="wrap row">
          <span className="b">BANBLIT</span>
          {/* 아직 만들지 않은 페이지다 — 진짜 없는 곳으로 보내는 대신 눌리지 않는 글로 둔다. */}
          <button type="button" disabled>이용약관</button>
          <button type="button" disabled>개인정보 처리방침</button>
          <button type="button" disabled>문의</button>
        </div>
      </footer>
    </div>
  );
}
