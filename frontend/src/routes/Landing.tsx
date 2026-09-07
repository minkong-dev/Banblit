import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Link } from "react-router-dom";

import { ArrowIcon, CloseIcon, WideMenuIcon } from "../components/icons";
import { usePage } from "../components/hooks";
import "../styles/landing.css";

const BOXES = [
  {
    rail: "Scheduler Engine",
    title: ["모두가 가능한 시간을", "찾아 헤매지 않도록"],
    body: "집중 합주기간에는 팀마다 합주량이 고르게 돌아가도록 자리를 직접 배정해요. 모두가 가능한 시간부터, 합주실이 비어 있는 시간, 여러 팀에 소속된 한명이 끼치는 영향까지 한 번에 계산해요.",
    num: "0.6초",
    unit: "확정된 일정을 불러오는 시간",
  },
  {
    rail: "Reservation",
    title: ["비어있는 시간도", "예약해서 사용하도록"],
    body: "비어있는 시간은 30분 단위로 예약이 가능해요. 메인 캘린더에도 표시되어 헷갈리지 않고, 취소나 변경도 자유롭게 가능해요.",
    num: "3단계",
    unit: "예약 확정까지 소모되는 단계",
  },
  {
    rail: "Calender Fix Engine",
    title: ["모두가 맞는 시간이 없어도", "새로 계산하지 않도록"],
    body: "한 명만 빼고 진행하면 가능한 날도 있으니까요. 그런 상황도 모두 엔진이 연산해서 제공해드리니, 확인해보시고 결정만 해주시면 돼요.",
    num: "2회",
    unit: "일일 스케줄링 엔진 업데이트 횟수",
  },
];

const STEPS = [
  {
    k: "STEP 1",
    title: "불가능한 시간을 추가해주세요",
    body: "캘린더에서 날짜를 선택하거나, Blit AI에게 말해주세요. 눈치보면서 말하는건 부담스러우니까요.",
  },
  {
    k: "STEP 2",
    title: "스케줄링 엔진을 기다려요",
    body: "엔진은 정해진 시간에 불가능한 시간을 모아 계산해요. 완료되면 알림도 보내드릴게요.",
  },
  {
    k: "STEP 3",
    title: "메인 캘린더를 확인해요",
    body: "메인 캘린더에서 내 일정을 확인해주세요. 우리 팀 합주시간을 한 눈에 보고, 지각하지 말자구요.",
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
        <a href="#how" onClick={() => setMenuOpen(false)}>TITLE</a>
        <a href="#auto" onClick={() => setMenuOpen(false)}>HOW IT WORKS</a>
        <a href="#admin" onClick={() => setMenuOpen(false)}>FOR MANAGERS</a>
        <Link to="/login" onClick={() => setMenuOpen(false)}>JOIN IN</Link>
      </nav>

      <section className="hero">
        <div>
          <h1>
            합주실 예약, 어렵지 않을 때도 됐으니까.<br />
            지금, <span className="mark">BANBLIT.</span>
          </h1>
          <p className="sub">세상 쉬운 합주 일정 관리, Banblit</p>
          <Link className="go" to="/login">시작하기<ArrowIcon /></Link>
        </div>
        <span className="cue">SCROLL</span>
      </section>

      <section className="sec" id="how">
        <div className="wrap stack">
          {/* 세로 한 장에 정사각 한 장을 걸쳐 둔다. 배경으로만 넣은 장식이라 읽어 줄
              글이 없다 — 화면을 읽어 주는 도구는 그냥 지나간다. */}
          <div className="shots rise">
            <div className="shot back" />
            <div className="shot front" />
          </div>
          <div className="copy rise">
            <p className="lead">불가능한 시간대만 입력하면,<br />알아서 업데이트 해주니까.</p>
            <p className="lead">서로 눈치 볼 필요없이,<br />모든 일정을 하나로</p>
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
          <p className="lead rise">많은 걸 할 필요는 없어요.<br />아래 세 가지로 충분해요.</p>
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
            합주실이 늘어도,<br></br> 열고 닫는 시간이 변해도 괜찮아요.<br></br><b>설정 페이지만 조금 바꿔주세요.</b>
          </p>
          <ul className="rise">
            <li><b>합주실</b><span>합주실마다 운영시간을 정하고, 합주실 수가 늘어나도 괜찮아요.</span></li>
            <li><b>기간</b><span>상시 개방과 집중 합주기간, 엔진 연산 시간을 직접 정할 수 있어요.</span></li>
            <li><b>조율</b><span>최선의 수가 없다면, 선택지로 전달할게요. 더 좋은 방향으로 선택해주세요.</span></li>
          </ul>
        </div>
      </section>

      <section className="sec end">
        <div className="wrap">
          <h2 className="rise">앞으로의 공연 시간표는<br /><span className="mark">BANBLIT</span>으로.</h2>
          <p className="rise">복잡한 계산은 여기 두고, 더 좋은 무대를 만들어주세요.</p>
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
