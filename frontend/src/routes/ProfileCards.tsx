// 프로필 화면(/profile)의 카드들입니다. 로그인한 모든 사람이 자기 계정을 여기에서 수정합니다.
// 2026-09-23 에 설정 화면의 계정 탭을 없애고 이 화면으로 옮겼습니다 — 같은 항목의 입력칸이
// 두 곳에 있었습니다.
//
// 이메일은 다루지 않습니다. 로그인 식별자는 새 주소가 실제로 본인의 주소인지 검증하는
// 절차가 따로 필요하며, 그 절차가 미구현이기 때문입니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { Card } from "../components/AppShell";
import { useMe } from "../components/queries";
import { getJSON, reason, sendFile } from "../lib/api";
import { applyTheme, readSavedTheme, type Theme } from "../lib/theme";
import { say } from "../lib/toast";
import { LOADING_TEXT } from "../lib/loading";
import type { Account } from "../lib/contract";
import { SectionHead } from "./SettingsForm";


/** 카드 아래 줄의 실행 버튼입니다. 요청 중이면 비활성화하고 busyLabel 을 표시합니다. 카드 3개가 같은 부품을 사용합니다. */
function FootButton({ label, busyLabel, pending, disabled = false, danger = false, onClick }: {
  label: string;
  busyLabel: string;
  pending: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="listfoot">
      <button className={danger ? "new danger" : "new"} disabled={disabled || pending} onClick={onClick}>
        {pending ? busyLabel : label}
      </button>
    </div>
  );
}


/** 프로필 사진입니다. 계정 1개에 1장이고, 없으면 이름 앞 두 글자를 표시합니다. */
function MyPhoto({ me }: { me: Account }) {
  const client = useQueryClient();
  const pick = useRef<HTMLInputElement>(null);
  const [bad, setBad] = useState("");

  function done(text: string): void {
    void client.invalidateQueries({ queryKey: ["me"] });
    setBad("");
    say(text);
  }

  const upload = useMutation({
    mutationFn: (file: File) => sendFile<{ ok: boolean }>("/me/avatar", file, () => {}),
    onSuccess: () => done("프로필 사진을 변경했어요."),
    onError: (error) => setBad(reason(error)),
  });

  const remove = useMutation({
    mutationFn: () => getJSON<null>("/me/avatar", { method: "DELETE" }),
    onSuccess: () => done("프로필 사진을 삭제했어요."),
    onError: (error) => setBad(reason(error)),
  });

  return (
    <Card>
      <SectionHead title="프로필 사진" desc="jpg·png·gif·webp 파일 1장을 올릴 수 있어요" />
      <div className="photo">
        <Avatar id={me.id} name={me.name} className="big" photo={me.avatar} />
        <div className="pickfile">
          <input
            ref={pick}
            id="myPhoto"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // 같은 파일을 다시 선택해도 변경으로 감지되도록 입력칸을 비웁니다.
              event.target.value = "";
              if (file !== undefined) upload.mutate(file);
            }}
          />
          <button className="new" disabled={upload.isPending} onClick={() => pick.current?.click()}>
            {upload.isPending ? "올리는 중…" : "사진 선택"}
          </button>
          <button className="new danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? "삭제하는 중…" : "사진 삭제"}
          </button>
        </div>
      </div>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Card>
  );
}

/** 화면 밝기를 선택하는 카드입니다. 선택한 값은 브라우저에 저장되어 다음에 열 때도 유지됩니다. */
function ThemeCard() {
  // 초기값을 한 번만 읽습니다. 이후 사용자가 선택한 값이 정본입니다.
  const [theme, setTheme] = useState<Theme>(() => readSavedTheme());

  const choices: { key: Theme; label: string }[] = [
    { key: "light", label: "라이트" },
    { key: "dark", label: "다크" },
  ];

  return (
    <Card>
      <SectionHead title="테마" desc="현재 브라우저에서의 테마를 지정해요" />
      <div className="display">
        <div className="pick" role="group" aria-label="화면 밝기">
          {choices.map((choice) => (
            <button
              key={choice.key}
              aria-pressed={theme === choice.key}
              onClick={() => setTheme(applyTheme(choice.key))}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

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
      <SectionHead title="내 정보" desc="가입한 이메일을 제외한 정보를 수정할 수 있어요" />
      <div className="fields">
        <label className="wide" htmlFor="myName">
          이름
          <input id="myName" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="wide" htmlFor="myCohort">
          기수
          <input
            id="myCohort"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            placeholder="예: 46"
            value={cohort}
            onChange={(event) => setCohort(event.target.value)}
          />
        </label>
      </div>
      <FootButton
        label="저장"
        busyLabel="저장하는 중…"
        pending={save.isPending}
        onClick={() => {
          // 상세한 검증은 서버가 합니다. 화면은 빈 값만 먼저 차단합니다.
          const why = name.trim() === "" ? "이름을 입력해 주세요." : "";
          setBad(why);
          if (why === "") save.mutate();
        }}
      />
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
      <SectionHead title="비밀번호" desc="비밀번호를 변경 할 수 있어요" />
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
      <FootButton
        label="비밀번호 변경"
        busyLabel="변경사항 저장 중…"
        pending={save.isPending}
        onClick={() => {
          // 길이 등의 규칙은 서버가 검증합니다. 두 번 입력한 값이 일치하지 않는 경우만
          // 화면에서 먼저 감지합니다. 서버는 새 비밀번호 하나만 받으므로 일치 여부를 확인할 수 없기 때문입니다.
          const why = next === again ? "" : "비밀번호가 일치하지 않아요.";
          setBad(why);
          if (why === "") save.mutate();
        }}
      />
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
      <SectionHead title="회원 탈퇴" desc="계정과 함께 작성한 글·댓글·예약이 모두 삭제되고, 이 작업은 되돌릴 수 없어요" />
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
      <FootButton
        label="탈퇴하기"
        busyLabel="회원 탈퇴 중…"
        pending={leave.isPending}
        disabled={!matched}
        danger
        onClick={() => leave.mutate()}
      />
    </Card>
  );
}

export function ProfileCards() {
  const { me } = useMe();
  if (me === null) return <div className="empty">{LOADING_TEXT}</div>;
  return (
    <>
      <MyPhoto me={me} />
      <MyProfile me={me} />
      <MyPassword />
      <ThemeCard />
      <Leave me={me} />
    </>
  );
}
