// 프로필 화면(/profile)입니다. 로그인한 모든 사람이 자기 계정을 여기에서 수정합니다. 카드 1개가 값 표시와 편집을 전환합니다.
//
// 평소에는 값만 표시합니다. 오른쪽 위 편집을 누르면 입력칸이 열리고, 저장 한 번으로 이름, 기수, 비밀번호를
// 전부 기록합니다(사용자 결정 2026-09-28). 프로필 사진은 편집 상태와 관계없이 바로 변경합니다.
//
// 이메일, 학과는 표시만 합니다.

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { Card, SectionHead } from "../components/Layout";
import { BackButton, Button, EditButton, Empty, FilePicker, MenuItem, Why } from "../components/controls";
import { Popover } from "../components/Popover";
import { ME_KEY, teamMembersQuery, useMe } from "../components/queries";
import { say } from "../components/toast";
import { reason } from "../lib/api";
import { roleLabel } from "../lib/account";
import type { Account, Member } from "../lib/contract";
import { LOADING_TEXT } from "../lib/loading";
import { leaveAccount, resetAvatar, saveProfile, uploadAvatar } from "../lib/pipeline";
import { cohortLabel } from "../lib/roster";
import { profileDraftMessage } from "../lib/validate";
import "../styles/profile.css";

/** 표시 상태의 한 줄입니다. 왼쪽 항목 이름, 오른쪽 값. */
type InfoRow = { label: string; text: string };

/** 편집 상태의 입력값입니다. 편집을 누를 때 지금 계정 값으로 새로 만듭니다. */
type Draft = { name: string; cohort: string; current: string; next: string; again: string };

function draftOf(me: Account): Draft {
  return { name: me.name, cohort: me.cohort === null ? "" : String(me.cohort), current: "", next: "", again: "" };
}

// 프로필 사진 변경 popover 의 id 입니다.
const PHOTO_MENU_ID = "photoMenu";

/** 프로필 사진 업로드와 기본 이미지 적용 요청입니다. 성공하면 ME_KEY 를 다시 조회하고 결과를 toast 로 알립니다. */
function useAvatarChange(): { upload: (file: File) => void; reset: () => void; busy: boolean } {
  const client = useQueryClient();
  const done = (text: string): void => {
    void client.invalidateQueries({ queryKey: ME_KEY });
    say(text);
  };
  const upload = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: () => done("프로필 사진을 변경했어요."),
    onError: (error) => say(reason(error)),
  });
  const reset = useMutation({
    mutationFn: resetAvatar,
    onSuccess: () => done("기본 이미지를 적용했어요."),
    onError: (error) => say(reason(error)),
  });
  return { upload: upload.mutate, reset: reset.mutate, busy: upload.isPending || reset.isPending };
}

/** 큰 원형 사진과 그 위의 "프로필 사진 변경" 버튼입니다. 버튼을 누르면 popover 메뉴 2개를 표시합니다.
 *  업로드는 숨긴 파일 입력칸을 대신 누르고, 기본 이미지 적용은 올린 사진을 삭제해 이름 앞 두 글자로 되돌립니다. */
function PhotoEdit({ me }: { me: Account }) {
  const pick = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { upload, reset, busy } = useAvatarChange();

  function close(): void {
    document.getElementById(PHOTO_MENU_ID)?.hidePopover();
  }

  return (
    <div className="photo">
      <button
        ref={trigger}
        type="button"
        className="change"
        aria-controls={PHOTO_MENU_ID}
        aria-expanded={open}
        // 요청 중에는 disabled 가 아니라 aria-disabled 로 막습니다. 메뉴를 닫으면 포커스가 이 버튼으로 돌아오는데,
        // 포커스를 가진 버튼이 disabled 가 되면 WebKit(Safari)은 포커스를 body 로 이동합니다.
        // preventDefault 가 popoverTarget 의 기본 동작(메뉴 열기)을 막습니다.
        aria-disabled={busy}
        onClick={(event) => { if (busy) event.preventDefault(); }}
        popoverTarget={PHOTO_MENU_ID}
      >
        프로필 사진 변경
      </button>
      <Popover
        id={PHOTO_MENU_ID}
        label="프로필 사진 변경"
        role="group"
        className="pop"
        onOpenChange={(next) => {
          setOpen(next);
          // popover 가 닫히면 다음 frame 에 포커스를 trigger 버튼으로 이동합니다.
          // 브라우저가 popover 를 숨기며 실행하는 포커스 정리보다 나중에 실행해야 이동한 포커스가 덮어쓰이지 않습니다.
          if (!next) requestAnimationFrame(() => trigger.current?.focus());
        }}
      >
        <MenuItem onClick={() => { close(); pick.current?.click(); }}>프로필 사진 업로드</MenuItem>
        <MenuItem onClick={() => { close(); reset(); }}>기본 이미지 적용</MenuItem>
      </Popover>
      <Avatar id={me.id} name={me.name} className="big" photo={me.avatar} />
      <FilePicker
        ref={pick}
        id="myPhoto"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onFiles={([file]) => upload(file)}
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

/** 프로필 편집 저장입니다. 바뀐 값만 보내는 규칙은 lib/pipeline 의 saveProfile 에 있습니다. */
function useSaveProfile(me: Account, onSaved: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: Draft) => saveProfile(me, draft),
    onSettled: () => { void client.invalidateQueries({ queryKey: ME_KEY }); },
    onSuccess: () => {
      say("프로필을 수정했어요.");
      onSaved();
    },
  });
}

/** 프로필 카드 하나입니다. 표시 상태와 편집 상태를 전환하고, 편집 상태에서만 회원 탈퇴 카드를 아래에 표시합니다. */
function ProfileCard({ me, rows }: { me: Account; rows: InfoRow[] }) {
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
    const why = profileDraftMessage(draft);
    setBad(why);
    if (why === "") save.mutate(draft, { onError: (error) => setBad(reason(error)) });
  }

  return (
    <>
      <Card>
        <div className="probar">
          {editing
            ? <Button kind="ghost" onClick={() => setEditing(false)}>취소</Button>
            : <BackButton onClick={() => void navigate(-1)} />}
          {editing
            ? <Button kind="go" pending={save.isPending} onClick={submit}>저장</Button>
            : <EditButton label="프로필 편집" onClick={startEdit} />}
        </div>
        <div className="prohead">
          <PhotoEdit me={me} />
          <span className="role">{roleLabel(me)}</span>
          <h1>{me.name}</h1>
          {me.department === null ? null : <p className="dept">{me.department}</p>}
        </div>
        {editing ? <DraftFields draft={draft} onChange={setDraft} /> : <InfoList rows={rows} />}
        <Why text={bad} />
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
    mutationFn: leaveAccount,
    onSuccess: () => { void navigate("/"); },
    onError: (error) => say(reason(error)),
  });

  return (
    <Card>
      <SectionHead title="회원 탈퇴" desc="계정과 함께 작성한 글, 댓글, 예약이 모두 삭제되고, 이 작업은 되돌릴 수 없어요" />
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
        <Button kind="danger" pending={leave.isPending} pendingLabel="회원 탈퇴 중…" disabled={!matched} onClick={() => leave.mutate()}>
          탈퇴하기
        </Button>
      </div>
    </Card>
  );
}

/** 프로필 카드가 소속 팀 줄에 표시하는 값입니다. teamName 은 팀 이름, text 는 그 팀에서의 기수입니다. */
type Affiliation = { teamName: string; text: string };

/** 소속 팀마다 팀 이름과 그 팀 명단에서 찾은 내 기수를 반환합니다. 조회에 실패한 팀은 실패 사유를 반환합니다. */
function useMyAffiliations(
  me: Account | null,
  teamIds: number[],
  teams: { id: number; name: string }[],
): Affiliation[] {
  const teamName = (id: number): string =>
    teams.find((team) => team.id === id)?.name ?? "이름 없는 팀";

  const memberQueries = useQueries({
    queries: teamIds.map((id) => teamMembersQuery(id)),
  });

  /** mine 의 기수 문구를 반환합니다. mine 이 undefined 이면 찾지 못한 사유를 반환합니다. */
  function cohortText(mine: Member | undefined): string {
    if (mine === undefined) return "멤버 리스트에서 찾지 못했어요";
    return cohortLabel(mine.cohort);
  }

  return memberQueries.map((query, index) => {
    const id = teamIds[index] ?? 0;
    if (query.isPending) return { teamName: teamName(id), text: LOADING_TEXT };
    if (query.isError) return { teamName: teamName(id), text: reason(query.error) };
    const mine = me === null ? undefined : query.data.find((member) => member.id === me.id);
    return { teamName: teamName(id), text: cohortText(mine) };
  });
}

/** 프로필을 표시하고 수정합니다. 카드 하나가 평소에는 값을 표시하고, 오른쪽 위 편집을 누르면 입력칸으로 전환합니다.
 *  테마는 상단바의 버튼이 전환합니다. */
export function Profile() {
  const { me, meState, teamIds, teams } = useMe();
  const affiliations = useMyAffiliations(me, teamIds, teams);
  // meState 로 구분하지 않으면 조회가 실패해도 "불러오는 중…" 이 그대로 남아 사용자가
  // 기다리기만 합니다.
  if (me === null) {
    return <div className="main"><Empty as="div" state={meState} text="로그인이 필요해요." /></div>;
  }

  const rows = [
    { label: "아이디", text: me.login_id ?? "" },
    { label: "이메일", text: me.email },
    { label: "기수", text: cohortLabel(me.cohort) },
    ...affiliations.map((row) => ({ label: row.teamName, text: row.text })),
  ];
  return <div className="main"><ProfileCard me={me} rows={rows} /></div>;
}
