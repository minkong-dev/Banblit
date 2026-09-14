// 설정 화면의 계정 구역입니다. 권한과 무관하게 로그인한 모든 사람이 봅니다.
// 이 구역의 항목은 전부 자신의 계정에 대한 설정입니다.
//
// 이메일은 다루지 않습니다. 로그인 식별자는 새 주소가 실제로 본인의 주소인지 검증하는
// 절차가 따로 필요하며, 그 절차가 미구현이기 때문입니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "../components/AppShell";
import { useMe } from "../components/hooks";
import { getJSON, reason } from "../lib/api";
import { say } from "../lib/toast";
import type { Account } from "../lib/contract";


/** 자신의 이름과 기수입니다. */
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
      say("내 정보를 수정했어요.");
    },
    onError: (error) => setBad(reason(error)),
  });

  return (
    <Card>
      <div className="sethead">
        <b>내 정보</b>
        <span>가입한 이메일을 제외한 정보를 수정할 수 있어요</span>
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
            // 상세한 검증은 서버가 합니다. 화면은 빈 값만 먼저 차단합니다.
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

/** 비밀번호를 변경합니다. 현재 비밀번호를 먼저 확인하는 방식은 서버도 같습니다. */
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
            // 길이 등의 규칙은 서버가 검증합니다. 두 번 입력한 값이 일치하지 않는 경우만
            // 화면에서 먼저 감지합니다. 서버는 새 비밀번호 하나만 받으므로 일치 여부를 확인할 수 없기 때문입니다.
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

/** 회원을 탈퇴합니다. 되돌릴 수 없으므로 이름을 직접 입력하게 합니다. 실수로 누른 경우와 구분하기 위함입니다. */
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
        <span>계정과 함께 작성한 글·댓글·예약이 모두 삭제되고, 이 작업은 되돌릴 수 없어요</span>
      </div>
      <div className="fields">
        <label className="wide" htmlFor="leaveName">
          확인을 위해 이름을 정확히 적어주세요
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
          {leave.isPending ? "회원 탈퇴 중…" : "탈퇴하기"}
        </button>
      </div>
    </Card>
  );
}

export function AccountCards(props: {
  /** 화면 밝기 카드입니다. 밝기는 이 브라우저에만 저장되는 값이라 서버를 호출하지 않습니다.
   *  따라서 계정 구역과 다른 위치(Settings.tsx)가 생성하고, 이 구역에서는 표시만 합니다. */
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
