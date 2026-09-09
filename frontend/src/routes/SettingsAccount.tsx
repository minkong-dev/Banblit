// 설정 화면의 계정 구역. 권한과 무관하게 로그인한 사람 누구에게나 보인다 —
// 여기 있는 것은 전부 자기 계정에 대한 일이다.
//
// 이메일은 다루지 않는다. 로그인 식별자라 바꾸려면 새 주소가 내 것인지 확인하는
// 절차가 따로 있어야 하고, 그 절차가 아직 없다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "../components/AppShell";
import { useMe } from "../components/hooks";
import { getJSON, reason } from "../lib/api";
import { say } from "../lib/toast";
import type { Account } from "../lib/contract";


/** 내 이름과 기수. */
function MyProfile({ me }: { me: Account }) {
  const client = useQueryClient();
  const [name, setName] = useState(me.name);
  const [cohort, setCohort] = useState(me.cohort === null ? "" : String(me.cohort));
  const [bad, setBad] = useState("");

  const save = useMutation({
    mutationFn: () =>
      getJSON<{ account: Account }>("/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          cohort: cohort.trim() === "" ? null : Number(cohort),
        }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me"] });
      say("내 정보를 고쳤어요.");
    },
    onError: (error) => setBad(reason(error)),
  });

  return (
    <Card>
      <div className="sethead">
        <b>내 정보</b>
        <span>이름과 기수를 고칩니다. 이메일은 바꿀 수 없습니다</span>
      </div>
      <div className="fields">
        <label className="wide" htmlFor="myName">
          이름
          <input id="myName" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="wide" htmlFor="myCohort">
          기수
          <input
            id="myCohort"
            inputMode="numeric"
            placeholder="예: 46"
            value={cohort}
            onChange={(event) => setCohort(event.target.value)}
          />
        </label>
      </div>
      <div className="listfoot">
        <button
          className="new"
          disabled={save.isPending}
          onClick={() => {
            // 자세한 판정은 서버가 한다. 화면은 비어 있는 것만 먼저 막는다.
            const why = name.trim() === "" ? "이름을 입력해 주세요." : "";
            setBad(why);
            if (why === "") save.mutate();
          }}
        >
          {save.isPending ? "저장하는 중…" : "저장"}
        </button>
      </div>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Card>
  );
}

/** 비밀번호 바꾸기. 지금 비밀번호를 먼저 묻는 것은 서버도 같다. */
function MyPassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [bad, setBad] = useState("");

  const save = useMutation({
    mutationFn: () =>
      getJSON<null>("/me/password", {
        method: "POST",
        body: JSON.stringify({ current, next }),
      }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setAgain("");
      setBad("");
      say("비밀번호를 변경했어요.");
    },
    onError: (error) => setBad(reason(error)),
  });

  return (
    <Card>
      <div className="sethead">
        <b>비밀번호</b>
        <span>비밀번호를 변경 할 수 있어요</span>
      </div>
      <div className="fields">
        <label className="wide" htmlFor="pwNow">
          현재 비밀번호
          <input
            id="pwNow"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </label>
        <label className="wide" htmlFor="pwNext">
          새 비밀번호
          <input
            id="pwNext"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </label>
        <label className="wide" htmlFor="pwAgain">
          새 비밀번호 확인
          <input
            id="pwAgain"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
        </label>
      </div>
      <div className="listfoot">
        <button
          className="new"
          disabled={save.isPending}
          onClick={() => {
            // 길이 같은 규칙은 서버가 판정한다. 두 번 적은 것이 서로 다른 것만
            // 여기서 먼저 잡는다 — 서버는 하나만 받으므로 알 수 없는 일이다.
            const why = next === again ? "" : "비밀번호가 일치하지 않아요.";
            setBad(why);
            if (why === "") save.mutate();
          }}
        >
          {save.isPending ? "변경사항 저장 중…" : "비밀번호 변경"}
        </button>
      </div>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Card>
  );
}

/** 회원 탈퇴. 되돌릴 수 없어 이름을 직접 적게 한다 — 실수로 눌린 것과 가른다. */
function Leave({ me }: { me: Account }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const matched = typed.trim() === me.name;

  const leave = useMutation({
    mutationFn: () => getJSON<null>("/me", { method: "DELETE" }),
    onSuccess: () => { void navigate("/"); },
    onError: (error) => say(reason(error)),
  });

  return (
    <Card>
      <div className="sethead">
        <b>회원 탈퇴</b>
        <span>계정과 함께 내가 쓴 글·댓글·예약이 모두 사라집니다. 되돌릴 수 없습니다</span>
      </div>
      <div className="fields">
        <label className="wide" htmlFor="leaveName">
          확인을 위해 내 이름을 적어 주세요
          <input
            id="leaveName"
            value={typed}
            placeholder={me.name}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
      </div>
      <div className="listfoot">
        <button
          className="new danger"
          disabled={!matched || leave.isPending}
          onClick={() => leave.mutate()}
        >
          {leave.isPending ? "탈퇴하는 중…" : "탈퇴하기"}
        </button>
      </div>
    </Card>
  );
}

export function AccountCards(props: {
  /** 화면 밝기 카드. 밝기는 이 브라우저에만 남는 값이라 서버를 부르지 않아,
   *  계정 구역과 다른 자리(Settings.tsx)가 그리고 여기서는 놓기만 한다. */
  theme: React.ReactNode;
}) {
  const { theme } = props;
  const { me } = useMe();
  if (me === null) return <div className="empty">불러오는 중…</div>;
  return (
    <>
      <MyProfile me={me} />
      <MyPassword />
      {theme}
      <Leave me={me} />
    </>
  );
}
