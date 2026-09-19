import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { AppShell, Card } from "../components/AppShell";
import { Pager } from "../components/Pager";
import { Modal, Stepper } from "../components/Modal";
import { MemberSearch } from "../components/MemberSearch";
import { PencilIcon, SearchIcon, TrashIcon } from "../components/icons";
import { useFitCount } from "../components/hooks";
import { useMe, useTeams } from "../components/queries";
import { clampPage, pageCount, pageSlice } from "../lib/paging";
import { say } from "../lib/toast";
import { askDelete } from "../lib/confirm";
import { getJSON, reason } from "../lib/api";
import { loadState, stateText } from "../lib/loading";
import { can, canManageTeams, teamNavLabel } from "../lib/account";
import { checkSlotCounts, checkTeamName, memberLabel, slotName } from "../lib/pipeline";
import { INSTRUMENTS } from "../lib/contract";
import { TEAM_COLORS, teamColorKey } from "../lib/teamColors";
import { MAX_SLOTS_PER_TEAM, seatAssignments, seatKey, seatsOf, teamsShown } from "../lib/roster";
import type { Seat } from "../lib/roster";
import type { Instrument, Member, Team, TeamSlot } from "../lib/contract";
import { SectionHead } from "./SettingsForm";
import "../styles/teams.css";


type Counts = Record<string, number>;

const NO_SLOTS: Counts = Object.fromEntries(INSTRUMENTS.map((name) => [name, 0]));

/** 서버에서 받은 포지션 목록을 포지션별 자리 수로 집계합니다. */
function countsOf(slots: TeamSlot[]): Counts {
  return slots.reduce(
    (acc, slot) => ({ ...acc, [slot.instrument]: acc[slot.instrument] + 1 }),
    NO_SLOTS,
  );
}

/** 포지션을 포지션별로 묶어 이름을 붙입니다. 같은 포지션이 1자리뿐이면 번호를 제거하고 "드럼" 으로만 표시합니다. */
function labelled(slots: TeamSlot[]): { slot: TeamSlot; label: string }[] {
  const perInstrument = new Map<Instrument, number>();
  for (const slot of slots) {
    perInstrument.set(slot.instrument, (perInstrument.get(slot.instrument) ?? 0) + 1);
  }
  return slots.map((slot) => ({
    slot,
    label: slotName(slot.instrument, slot.ordinal, perInstrument.get(slot.instrument) ?? 1),
  }));
}

/** 팀 목록의 한 행입니다. 행을 클릭하면 포지션 구성이 열리며, 오른쪽 끝의 연필·삭제 버튼은
 *  팀을 수정할 권한이 있는 사람에게만 표시됩니다. */
function TeamRow(props: {
  team: Team;
  selected: boolean;
  mine: boolean;
  onOpen: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const { team, selected, mine, onOpen, onRename, onDelete } = props;
  return (
    <div className="teamline">
      <button
        className={selected ? "teamrow2 on" : "teamrow2"}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
      >
        <b>{team.name}</b>
        {mine ? <span className="mine">내 팀</span> : null}
        <span className="cnt">
          {team.filled_count}/{team.slot_count}
        </span>
      </button>
      {onRename === undefined ? null : (
        <span className="acts">
          <button className="ic" aria-label={`${team.name} 수정`} onClick={onRename}>
            <PencilIcon />
          </button>
          <button className="ic danger" aria-label={`${team.name} 삭제`} onClick={onDelete}>
            <TrashIcon />
          </button>
        </span>
      )}
    </div>
  );
}

/** 팀 색 선택 입력입니다. 다른 팀이 쓰는 색(taken)은 선택할 수 없게 비활성화합니다.
 *  value 가 null 이면 선택하지 않은 상태이고, 그대로 저장하면 서버가 남은 색 중 첫 색을 지정합니다. */
function ColorPick(props: { value: string | null; taken: string[]; onChange: (next: string) => void }) {
  const { value, taken, onChange } = props;
  // radio 묶음 이름입니다. 색 선택 입력이 2개 이상 동시에 렌더링되어도 서로 다른 묶음이 되도록 인스턴스마다 다른 값을 씁니다.
  const group = useId();
  return (
    <fieldset className="swatches">
      <legend>팀 색{value === null ? " · 선택하지 않으면 남은 색 중 하나가 지정돼요" : ""}</legend>
      {TEAM_COLORS.map((color) => {
        const used = taken.includes(color);
        return (
          <label key={color} className={`swatch ${teamColorKey(color)}`} title={used ? `${color} · 다른 팀이 쓰는 색` : color}>
            <input
              type="radio"
              name={group}
              value={color}
              checked={value === color}
              disabled={used}
              aria-label={used ? `${color}, 다른 팀이 쓰는 색` : color}
              onChange={() => onChange(color)}
            />
          </label>
        );
      })}
    </fieldset>
  );
}

/** 선택한 팀의 포지션 구성입니다. 빈 포지션도 함께 표시됩니다. 채워야 할 자리를 명확히 보여주는 것이 이 화면의 목적입니다. */
function Lineup(props: {
  teamId: number;
  /** 빈 포지션에 멤버를 배정할 수 있는지 여부입니다. */
  canAdd: boolean;
  /** 멤버가 배정된 포지션의 멤버 배정을 해제할 수 있는지 여부입니다. */
  canRemove: boolean;
}) {
  const { teamId, canAdd, canRemove } = props;
  const client = useQueryClient();
  const [seeking, setSeeking] = useState<number | null>(null);

  const slots = useQuery({
    queryKey: ["slots", teamId],
    queryFn: () => getJSON<{ slots: TeamSlot[] }>(`/teams/${teamId}/slots`),
  });

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ["slots", teamId] });
    void client.invalidateQueries({ queryKey: ["teams"] });
    void client.invalidateQueries({ queryKey: ["members", teamId] });
    // 현재 사용자가 추가되거나 제거된 포지션이면, "내 팀"(프로필·달력의 내 일정)도 함께 갱신됩니다.
    void client.invalidateQueries({ queryKey: ["me"] });
  };

  const sit = useMutation({
    mutationFn: (vars: { slotId: number; memberId: number }) =>
      getJSON(`/teams/${teamId}/slots/${vars.slotId}`, {
        method: "PUT",
        body: JSON.stringify({ member_id: vars.memberId }),
      }),
    onSuccess: () => {
      setSeeking(null);
      refresh();
    },
    onError: (error) => say(reason(error)),
  });

  const clear = useMutation({
    mutationFn: (slotId: number) =>
      getJSON(`/teams/${teamId}/slots/${slotId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (error) => say(reason(error)),
  });

  if (slots.isPending) return <div className="empty">불러오는 중…</div>;
  if (slots.isError) return <div className="empty">{reason(slots.error)}</div>;

  return (
    <ul className="lineup">
      {labelled(slots.data.slots).map(({ slot, label }) => (
        <li className={slot.member_id === null ? "seat open" : "seat"} key={slot.id}>
          <span className="part">{label}</span>
          {slot.member_id === null ? (
            <span className="who none">멤버가 지정되지 않았어요</span>
          ) : (
            <span className="who">{memberLabel(slot.member_name ?? "", slot.member_cohort)}</span>
          )}
          {!canAdd && !canRemove ? null : (
            <span className="acts">
              {!canAdd ? null : (
                <button
                  className="ic"
                  aria-label={`${label} 지정할 멤버 찾기`}
                  onClick={() => setSeeking(slot.id)}
                >
                  <SearchIcon />
                </button>
              )}
              {slot.member_id === null || !canRemove ? null : (
                <button
                  className="btn"
                  disabled={clear.isPending}
                  onClick={() => clear.mutate(slot.id)}
                >
                  삭제
                </button>
              )}
            </span>
          )}
          {seeking !== slot.id ? null : (
            <Modal title="멤버 검색" hint={label} onClose={() => setSeeking(null)}>
              <MemberSearch
                onPick={(member) => sit.mutate({ slotId: slot.id, memberId: member.id })}
              />
            </Modal>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 팀 창에 처음 입력할 값입니다. 새 팀은 BLANK_TEAM, 수정은 서버에서 받은 팀과 자리(startOf)입니다. */
type TeamStart = { name: string; color: string | null; counts: Counts; members: ReadonlyMap<string, Member> };

const BLANK_TEAM: TeamStart = { name: "", color: null, counts: NO_SLOTS, members: new Map() };

function startOf(team: Team, slots: TeamSlot[]): TeamStart {
  const members = new Map(
    slots.flatMap((slot): [string, Member][] =>
      slot.member_id === null
        ? []
        : [[seatKey(slot.instrument, slot.ordinal), { id: slot.member_id, name: slot.member_name ?? "", cohort: slot.member_cohort }]],
    ),
  );
  return { name: team.name, color: team.color, counts: countsOf(slots), members };
}

/** 팀 이름·색·포지션 수를 저장하고 저장된 팀을 반환합니다. team 이 null 이면 POST, 아니면 PATCH·PUT 입니다.
 *  수정할 때 포지션 수를 감소시키면 서버가 번호가 큰 자리부터 삭제하고 그 자리의 멤버도 팀에서 제외합니다. */
async function writeTeam(team: Team | null, name: string, color: string | null, counts: Counts): Promise<Team> {
  if (team === null) {
    const made = await getJSON<{ team: Team }>("/teams", {
      method: "POST",
      body: JSON.stringify({ name, slots: counts, color }),
    });
    return made.team;
  }
  if (name !== team.name || color !== team.color) {
    await getJSON(`/teams/${team.id}`, { method: "PATCH", body: JSON.stringify({ name, color }) });
  }
  await getJSON(`/teams/${team.id}/slots`, { method: "PUT", body: JSON.stringify({ slots: counts }) });
  return { ...team, name, color: color ?? team.color };
}

/** 저장된 자리를 seats 와 같게 변경합니다. 변경된 자리 전부를 요청 1번으로 보냅니다.
 *
 *  자리마다 요청을 보내면 중간 요청이 실패했을 때 앞선 자리만 반영된 상태로 끝납니다. 서버가
 *  transaction 1개로 처리하므로, 실패하면 아무것도 반영되지 않습니다. */
async function writeSeats(teamId: number, seats: Seat[]): Promise<void> {
  const saved = await getJSON<{ slots: TeamSlot[] }>(`/teams/${teamId}/slots`);
  const assignments = seatAssignments(seats, saved.slots);
  if (assignments.length === 0) return;
  await getJSON(`/teams/${teamId}/slot-members`, {
    method: "PUT",
    body: JSON.stringify({ assignments }),
  });
}

/** 팀 창의 이름·색·포지션 인원 입력입니다. */
function TeamFields(props: {
  name: string;
  color: string | null;
  counts: Counts;
  takenColors: string[];
  onName: (next: string) => void;
  onColor: (next: string) => void;
  onCounts: (next: Counts) => void;
}) {
  const { name, color, counts, takenColors, onName, onColor, onCounts } = props;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (
    <>
      <div className="fields">
        <label className="wide">
          팀 이름
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- 팀 편집 form 이 열릴 때 이름 입력칸으로 초점을 이동합니다. */}
          <input autoFocus value={name} placeholder="곡 이름" onChange={(event) => onName(event.target.value)} />
        </label>
      </div>
      <ColorPick value={color} taken={takenColors} onChange={onColor} />

      <p className="cap2">포지션 {total}개</p>
      {INSTRUMENTS.map((instrument) => (
        <Stepper
          key={instrument}
          label={instrument}
          value={counts[instrument] ?? 0}
          min={0}
          max={(counts[instrument] ?? 0) + Math.max(0, MAX_SLOTS_PER_TEAM - total)}
          onChange={(next) => onCounts({ ...counts, [instrument]: next })}
        />
      ))}
    </>
  );
}

/** 팀 창의 자리 목록과 멤버 검색 창입니다. 멤버 지정·삭제는 화면 값만 변경하고, 서버에는 저장 버튼을 누를 때 전송합니다. */
function SeatRows(props: {
  seats: Seat[];
  canAdd: boolean;
  canRemove: boolean;
  onPick: (seat: Seat, member: Member) => void;
  onRemove: (seat: Seat) => void;
}) {
  const { seats, canAdd, canRemove, onPick, onRemove } = props;
  const [seeking, setSeeking] = useState<Seat | null>(null);
  if (seats.length === 0) return <p className="empty">포지션 인원을 설정하면 자리가 추가돼요</p>;
  return (
    <>
      <ul className="lineup">
        {seats.map((seat) => (
          <li className={seat.member === null ? "seat open" : "seat"} key={seatKey(seat.instrument, seat.ordinal)}>
            <span className="part">{seat.label}</span>
            {seat.member === null ? (
              <span className="who none">멤버가 지정되지 않았어요</span>
            ) : (
              <span className="who">{memberLabel(seat.member.name, seat.member.cohort)}</span>
            )}
            <span className="acts">
              {!canAdd ? null : (
                <button className="ic" type="button" aria-label={`${seat.label} 지정할 멤버 찾기`} onClick={() => setSeeking(seat)}>
                  <SearchIcon />
                </button>
              )}
              {seat.member === null || !canRemove ? null : (
                <button className="btn" type="button" onClick={() => onRemove(seat)}>삭제</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {seeking === null ? null : (
        <Modal title="멤버 검색" hint={seeking.label} onClose={() => setSeeking(null)}>
          <MemberSearch
            exclude={seats.flatMap((seat) => (seat.member === null ? [] : [seat.member.id]))}
            onPick={(member) => { onPick(seeking, member); setSeeking(null); }}
          />
        </Modal>
      )}
    </>
  );
}

type TeamFormProps = {
  /** null 이면 새 팀입니다. */
  team: Team | null;
  start: TeamStart;
  /** 다른 팀의 이름입니다. */
  taken: string[];
  /** 다른 팀이 쓰는 색입니다. 이 팀의 현재 색은 포함하지 않습니다. */
  takenColors: string[];
  canAdd: boolean;
  canRemove: boolean;
  /** 있으면 아래 버튼 줄에 팀 삭제 버튼이 표시됩니다. 목록의 삭제 아이콘과 같은 동작입니다. */
  onDelete?: () => void;
  onDone: (message: string) => void;
  onClose: () => void;
};

/** 팀 이름·색·포지션 인원·멤버를 한 창에서 설정합니다. 새 팀과 팀 수정이 같은 창을 사용합니다.
 *  저장 버튼을 누르면 팀을 저장한 뒤 서버의 자리 목록을 조회하고, 포지션·번호로 대응시켜 멤버를 지정합니다. */
function TeamForm(props: TeamFormProps) {
  const { team, start, taken, takenColors, canAdd, canRemove, onDelete, onDone, onClose } = props;
  const client = useQueryClient();
  const [name, setName] = useState(start.name);
  const [color, setColor] = useState(start.color);
  const [counts, setCounts] = useState(start.counts);
  const [members, setMembers] = useState(start.members);
  // 새 팀 저장 후 멤버 지정이 실패했을 때 생성된 팀입니다. 재시도하면 POST 대신 이 팀에 수정 요청을 전송해 팀이 중복 생성되지 않습니다.
  // 목록을 다시 조회하면 taken 에 이 팀의 이름·색이 포함되므로 검증과 색 선택에서 제외합니다.
  const [created, setCreated] = useState<Team | null>(null);
  const [bad, setBad] = useState("");

  const seats = seatsOf(counts, members);
  const isNew = team === null;
  const idle = isNew ? "팀 생성" : "저장";

  const save = useMutation({
    mutationFn: async () => {
      const saved = await writeTeam(team ?? created, name.trim(), color, counts);
      if (isNew) setCreated(saved);
      // 멤버 지정·삭제 권한이 둘 다 없으면 seats 가 서버 값과 같으므로 자리 목록을 조회하지 않습니다.
      if (canAdd || canRemove) await writeSeats(saved.id, seats);
    },
    onSuccess: () => onDone(isNew ? `${name.trim()} 팀 생성을 완료했어요.` : `${name.trim()} 수정을 완료했어요.`),
    onError: (error) => setBad(reason(error)),
    onSettled: () => {
      for (const key of ["teams", "slots", "members", "me"]) void client.invalidateQueries({ queryKey: [key] });
    },
  });

  const submit = (): void => {
    const why = checkTeamName(name, taken.filter((one) => one !== created?.name)) || checkSlotCounts(counts);
    setBad(why);
    if (why === "") save.mutate();
  };
  const keyOf = (seat: Seat): string => seatKey(seat.instrument, seat.ordinal);

  return (
    <Modal title={isNew ? "새 팀" : "팀 수정"} hint="이름·색·포지션·멤버를 설정한 뒤 한 번에 저장해요" onClose={onClose}
      foot={
        <>
          {onDelete === undefined ? null : <button className="ghost drop" onClick={onDelete}>팀 삭제</button>}
          <button className="ghost" onClick={onClose}>취소</button>
          <button className="primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "저장하는 중…" : idle}</button>
        </>
      }
    >
      <TeamFields
        name={name} color={color} counts={counts}
        takenColors={takenColors.filter((one) => one !== created?.color)}
        onName={setName} onColor={setColor} onCounts={setCounts}
      />
      <p className="cap2">멤버</p>
      <SeatRows
        seats={seats} canAdd={canAdd} canRemove={canRemove}
        onPick={(seat, member) => setMembers((now) => new Map(now).set(keyOf(seat), member))}
        onRemove={(seat) => setMembers((now) => new Map([...now].filter(([key]) => key !== keyOf(seat))))}
      />
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Modal>
  );
}

/** 팀 수정 창입니다. 서버의 자리 목록을 조회한 뒤에 TeamForm 을 엽니다. 조회 전에 열면 빈 포지션으로 시작해 저장 시 자리가 삭제됩니다. */
function EditTeam(props: Omit<TeamFormProps, "team" | "start"> & { team: Team }) {
  const { team, onClose } = props;
  const slots = useQuery({
    queryKey: ["slots", team.id],
    queryFn: () => getJSON<{ slots: TeamSlot[] }>(`/teams/${team.id}/slots`),
  });

  if (slots.isPending || slots.isError) {
    return (
      <Modal title="팀 수정" onClose={onClose}>
        <p className="empty">{slots.isError ? reason(slots.error) : "불러오는 중…"}</p>
      </Modal>
    );
  }
  return <TeamForm {...props} start={startOf(team, slots.data.slots)} />;
}

export function Teams() {
  const { me, teamIds } = useMe();
  const [openId, setOpenId] = useState<number | null>(null);
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<Team | null>(null);
  const [page, setPage] = useState(1);
  const client = useQueryClient();

  const drop = useMutation({
    mutationFn: (team: Team) => getJSON<null>(`/teams/${team.id}`, { method: "DELETE" }),
    onSuccess: (_body, team) => {
      // 삭제된 팀의 포지션 구성이나 수정 창이 열려 있으면 함께 닫습니다.
      setOpenId((now) => (now === team.id ? null : now));
      setRenaming((now) => (now?.id === team.id ? null : now));
      void client.invalidateQueries({ queryKey: ["teams"] });
      say(`${team.name} 팀을 삭제했어요.`);
    },
    onError: (error) => say(reason(error)),
  });

  const teams = useTeams();
  const allTeams = teams.data?.teams ?? [];
  const manages = canManageTeams(me);
  // 팀 관리 권한이 없으면 메뉴 이름이 "내 팀"이므로 소속 팀만 표시합니다. 이름·색 중복 검증은 전체 팀(allTeams)으로 합니다.
  const list = teamsShown(allTeams, teamIds, manages);
  const canCreate = can(me, "team_create");
  const canRename = can(me, "team_edit");
  const canDrop = can(me, "team_delete");
  const askDrop = (team: Team): void => { if (askDelete(team.name)) drop.mutate(team); };
  const state = loadState(teams);
  // 목록을 렌더링할 수 없는 경우입니다. 아직 데이터를 받지 못했거나, 오류가 발생했거나, 데이터가 비어 있을 때입니다.
  const noList = state.kind !== "ready" || list.length === 0;

  // 한 페이지에 표시할 행 개수는 컨테이너 높이에 따라 결정됩니다. 목록은 스크롤하지 않고 페이지로 넘깁니다.
  const [box, perPage] = useFitCount(64);
  const pages = pageCount(list.length, perPage);
  const shownPage = clampPage(page, pages);
  const opened = list.find((team) => team.id === openId) ?? null;
  const others = (team: Team | null): Team[] => allTeams.filter((one) => one.id !== team?.id);

  return (
    <AppShell
      page="teams"
      current="find-team"
    >
      <div className="main">
        <Card>
          <SectionHead title={teamNavLabel(me)} desc="팀을 눌러 포지션을 확인해주세요" />

          {/* 데이터가 비어 있거나 로딩 중이어도 컨테이너는 그대로 유지합니다. 컨테이너 높이를 측정하여 한 페이지의 행 수를 결정하므로,
              컨테이너가 사라지면 측정할 대상이 없어집니다. */}
          <ul className="rows" ref={box}>
            {noList ? (
              <li className="empty">{stateText(state, manages ? "아직 생성된 팀이 없어요." : "소속된 팀이 없어요.")}</li>
            ) : (
              pageSlice(list, shownPage, perPage).map((team) => (
                <li key={team.id}>
                  <TeamRow
                    team={team}
                    selected={team.id === openId}
                    mine={teamIds.includes(team.id)}
                    onOpen={() => setOpenId(team.id)}
                    onRename={canRename ? () => setRenaming(team) : undefined}
                    onDelete={canDrop ? () => askDrop(team) : undefined}
                  />
                </li>
              ))
            )}
          </ul>

          <div className="listfoot">
            {noList ? null : (
              <Pager page={shownPage} pages={pages} onPage={setPage} />
            )}
            {!canCreate ? null : (
              <button className="new" onClick={() => setMaking(true)}>+ 새 팀</button>
            )}
          </div>
        </Card>
      </div>

      {/* 새 팀은 팀 생성 권한만으로 멤버까지 지정합니다(권한 설명 "새 팀을 추가하고 인원을 배정할 수 있어요"). */}
      {!making ? null : (
        <TeamForm
          team={null}
          start={BLANK_TEAM}
          taken={allTeams.map((team) => team.name)}
          takenColors={allTeams.map((team) => team.color)}
          canAdd
          canRemove
          onClose={() => setMaking(false)}
          onDone={(text) => { setMaking(false); say(text); }}
        />
      )}

      {renaming === null ? null : (
        <EditTeam
          team={renaming}
          taken={others(renaming).map((team) => team.name)}
          takenColors={others(renaming).map((team) => team.color)}
          canAdd={can(me, "member_add")}
          canRemove={can(me, "member_remove")}
          onDelete={canDrop ? () => askDrop(renaming) : undefined}
          onClose={() => setRenaming(null)}
          onDone={(text) => { setRenaming(null); say(text); }}
        />
      )}

      {opened === null ? null : (
        <Modal
          title={opened.name}
          hint={`포지션 ${opened.slot_count}개 중 ${opened.filled_count}명을 지정했어요`}
          onClose={() => setOpenId(null)}
        >
          <Lineup
            teamId={opened.id}
            canAdd={can(me, "member_add")}
            canRemove={can(me, "member_remove")}
          />
        </Modal>
      )}
    </AppShell>
  );
}
