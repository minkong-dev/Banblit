// 프로필 화면(/profile)의 카드입니다. 로그인한 모든 사람이 자기 계정을 여기에서 수정합니다.
// 2026-09-23 에 설정 화면의 계정 탭을 없애고 이 화면으로 옮겼습니다 — 같은 항목의 입력칸이
// 두 곳에 있었습니다.
//
// 평소에는 값만 표시합니다. 오른쪽 위 편집을 누르면 입력칸이 열리고, 저장 한 번으로 이름·기수·비밀번호를
// 전부 기록합니다(2026-09-28 사용자 결정). 프로필 사진은 편집 상태와 관계없이 바로 변경합니다.
//
// 이메일·학과는 표시만 합니다. 이메일은 새 주소가 본인의 주소인지 검증하는 절차가 미구현이고,
// 학과는 가입자를 구분하는 값(이름·학과·학번·기수)이라 서버에 수정 기능이 없습니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { Card, SectionHead } from "../components/Layout";
import { usePopoverRouteClose } from "../components/hooks";
import { ChevronLeftIcon, PencilIcon } from "../components/icons";
import { getJSON, reason, sendFile } from "../lib/api";
import { roleLabel } from "../lib/account";
import { personNameMessage } from "../lib/validate";
import { say } from "../lib/toast";
import type { Account } from "../lib/contract";

/** 표시 상태의 한 줄입니다. 왼쪽 항목 이름, 오른쪽 값. */
export type InfoRow = { label: string; text: string };

/** 편집 상태의 입력값입니다. 편집을 누를 때 지금 계정 값으로 새로 만듭니다. */
type Draft = { name: string; cohort: string; current: string; next: string; again: string };

function draftOf(me: Account): Draft {
  return { name: me.name, cohort: me.cohort === null ? "" : String(me.cohort), current: "", next: "", again: "" };
}

/** 저장 전에 화면에서 먼저 보는 규칙입니다. 서버도 같은 규칙으로 다시 검증합니다.
 *  서버는 새 비밀번호 하나만 받으므로 두 번 입력한 값의 일치 여부는 화면만 확인할 수 있습니다. */
function draftMessage(draft: Draft): string {
  const nameWhy = personNameMessage(draft.name);
  if (nameWhy !== "") return nameWhy;
  const cohort = draft.cohort.trim();
  if (cohort !== "" && !/^(100|[1-9][0-9]?)$/.test(cohort)) return "기수는 1부터 100 사이의 숫자로 입력해 주세요.";
  if (draft.next !== draft.again) return "비밀번호가 일치하지 않아요.";
  return "";
}

// 프로필 사진 변경 popover 의 id 입니다.
const PHOTO_MENU_ID = "photoMenu";

/** 큰 원형 사진과 그 위의 "프로필 사진 변경" 버튼입니다. 버튼을 누르면 말풍선 메뉴 2개를 표시합니다.
 *  업로드는 숨긴 파일 입력칸을 대신 누르고, 기본 이미지 적용은 올린 사진을 삭제해 이름 앞 두 글자로 되돌립니다. */
function PhotoEdit({ me }: { me: Account }) {
  const client = useQueryClient();
  const pick = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  usePopoverRouteClose(PHOTO_MENU_ID);

  function done(text: string): void {
    void client.invalidateQueries({ queryKey: ["me"] });
    say(text);
  }

  function close(): void {
    document.getElementById(PHOTO_MENU_ID)?.hidePopover();
  }

  const upload = useMutation({
    mutationFn: (file: File) => sendFile<{ ok: boolean }>("/me/avatar", file, () => {}),
    onSuccess: () => done("프로필 사진을 변경했어요."),
    onError: (error) => say(reason(error)),
  });

  const reset = useMutation({
    mutationFn: () => getJSON<null>("/me/avatar", { method: "DELETE" }),
    onSuccess: () => done("기본 이미지를 적용했어요."),
    onError: (error) => say(reason(error)),
  });

  const busy = upload.isPending || reset.isPending;
  return (
    <div className="photo">
      <button
        ref={trigger}
        type="button"
        className="change"
        aria-controls={PHOTO_MENU_ID}
        aria-expanded={open}
        // 요청 중에는 disabled 가 아니라 aria-disabled 로 막습니다. 메뉴를 닫으면 초점이 이 버튼으로 돌아오는데,
        // 초점을 가진 버튼이 disabled 가 되면 WebKit(Safari)은 초점을 body 로 옮깁니다(2026-09-30 WebKit e2e 로 발견).
        // preventDefault 가 popoverTarget 의 기본 동작(메뉴 열기)을 막습니다.
        aria-disabled={busy}
        onClick={(event) => { if (busy) event.preventDefault(); }}
        popoverTarget={PHOTO_MENU_ID}
      >
        프로필 사진 변경
      </button>
      <div
        id={PHOTO_MENU_ID}
        popover="auto"
        className="pop"
        role="group"
        aria-label="프로필 사진 변경"
        onToggle={(event) => {
          setOpen(event.newState === "open");
          // 팝업이 닫히면 초점을 여는 버튼으로 되돌립니다. popover 는 이 동작을 대신해주지 않습니다.
          // 되돌리지 않으면 초점이 사라진 메뉴와 함께 문서 맨 앞으로 갑니다.
          // 메뉴 안의 버튼을 눌러 닫을 때는 그 버튼이 이미 초점을 갖고 있어, 브라우저가 popover 를
          // 숨기며 처리하는 초점 정리가 이 함수보다 나중에 실행되면 여기서 옮긴 초점을 덮어씁니다.
          // requestAnimationFrame 으로 한 프레임 미뤄 브라우저의 정리가 끝난 뒤에 옮깁니다(2026-09-29 e2e 로 발견).
          if (event.newState === "closed") requestAnimationFrame(() => trigger.current?.focus());
        }}
      >
        <button type="button" className="act" onClick={() => { close(); pick.current?.click(); }}>
          프로필 사진 업로드
        </button>
        <button type="button" className="act" onClick={() => { close(); reset.mutate(); }}>
          기본 이미지 적용
        </button>
      </div>
      <Avatar id={me.id} name={me.name} className="big" photo={me.avatar} />
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
    </div>
  );
}

/** 편집 상태의 입력칸입니다. 비밀번호 3칸은 변경할 때만 채웁니다. */
function DraftFields({ draft, onChange }: { draft: Draft; onChange: (next: Draft) => void }) {
  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, [key]: event.target.value }),
  });
  return (
    <>
      <div className="fields">
        <label className="wide" htmlFor="myName">이름<input id="myName" {...field("name")} /></label>
        <label className="wide" htmlFor="myCohort">
          기수
          <input id="myCohort" type="number" inputMode="numeric" min={1} max={100} step={1} placeholder="예: 46" {...field("cohort")} />
        </label>
      </div>
      <SectionHead title="비밀번호" desc="변경할 때만 입력해요" />
      <div className="fields">
        <label className="wide" htmlFor="pwNow">
          현재 비밀번호<input id="pwNow" type="password" autoComplete="current-password" {...field("current")} />
        </label>
        <label className="wide" htmlFor="pwNext">
          새 비밀번호<input id="pwNext" type="password" autoComplete="new-password" {...field("next")} />
        </label>
        <label className="wide" htmlFor="pwAgain">
          새 비밀번호 확인<input id="pwAgain" type="password" autoComplete="new-password" {...field("again")} />
        </label>
      </div>
    </>
  );
}

/** 저장 한 번에 바뀐 것만 보냅니다. 이름·기수가 그대로면 PATCH 를, 새 비밀번호가 비어 있으면 비밀번호 변경을 건너뜁니다.
 *  ponytail: 요청 2개를 차례로 보내 이름은 저장되고 비밀번호만 실패할 수 있습니다. 실패 사유는 화면에 표시하고
 *  편집 상태를 유지합니다. 한 번에 기록해야 하면 서버에 두 값을 함께 받는 endpoint 를 만듭니다. */
function useSaveProfile(me: Account, onSaved: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (draft: Draft) => {
      const cohort = draft.cohort.trim() === "" ? null : Number(draft.cohort);
      const infoChanged = draft.name.trim() !== me.name || cohort !== me.cohort;
      if (infoChanged) {
        await getJSON<{ account: Account }>("/me", {
          method: "PATCH",
          body: JSON.stringify({ name: draft.name.trim(), cohort }),
        });
      }
      if (draft.next === "") return;
      try {
        await getJSON<null>("/me/password", {
          method: "POST",
          body: JSON.stringify({ current: draft.current, next: draft.next }),
        });
      } catch (error) {
        // 이름·기수가 이미 저장된 경우 그 사실을 함께 알립니다. 알리지 않으면 아무것도 저장되지 않은 것으로 읽힙니다.
        if (!infoChanged) throw error;
        throw new Error(`이름·기수는 저장했지만 비밀번호는 변경하지 못했어요. ${reason(error)}`);
      }
    },
    onSettled: () => { void client.invalidateQueries({ queryKey: ["me"] }); },
    onSuccess: () => {
      say("프로필을 수정했어요.");
      onSaved();
    },
  });
}

/** 프로필 카드 하나입니다. 표시 상태와 편집 상태를 전환하고, 편집 상태에서만 회원 탈퇴 카드를 아래에 표시합니다. */
export function ProfileCard({ me, rows }: { me: Account; rows: InfoRow[] }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(me));
  const [bad, setBad] = useState("");
  const save = useSaveProfile(me, () => setEditing(false));

  function startEdit(): void {
    setDraft(draftOf(me));
    setBad("");
    setEditing(true);
  }

  function submit(): void {
    const why = draftMessage(draft);
    setBad(why);
    if (why === "") save.mutate(draft, { onError: (error) => setBad(reason(error)) });
  }

  return (
    <>
      <Card>
        <div className="probar">
          {editing
            ? <button type="button" className="btn" onClick={() => setEditing(false)}>취소</button>
            : <button type="button" className="ic" aria-label="뒤로 가기" onClick={() => void navigate(-1)}><ChevronLeftIcon /></button>}
          {editing
            ? <button type="button" className="btn go" disabled={save.isPending} onClick={submit}>{save.isPending ? "저장하는 중…" : "저장"}</button>
            : <button type="button" className="ic" aria-label="프로필 편집" onClick={startEdit}><PencilIcon /></button>}
        </div>
        <div className="prohead">
          <PhotoEdit me={me} />
          <span className="role">{roleLabel(me)}</span>
          <h1>{me.name}</h1>
          {me.department === null ? null : <p className="dept">{me.department}</p>}
        </div>
        {editing ? <DraftFields draft={draft} onChange={setDraft} /> : <InfoList rows={rows} />}
        {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
      </Card>
      {editing ? <Leave me={me} /> : null}
    </>
  );
}

function InfoList({ rows }: { rows: InfoRow[] }) {
  return (
    <div className="read">
      <dl>
        {rows.map((row) => (
          <div className="afrow" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.text}</dd>
          </div>
        ))}
      </dl>
    </div>
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
      <div className="listfoot">
        <button className="new danger" disabled={!matched || leave.isPending} onClick={() => leave.mutate()}>
          {leave.isPending ? "회원 탈퇴 중…" : "탈퇴하기"}
        </button>
      </div>
    </Card>
  );
}
