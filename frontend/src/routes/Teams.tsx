import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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
import { can } from "../lib/account";
import { checkSlotCounts, checkTeamName, memberLabel, slotName } from "../lib/pipeline";
import { INSTRUMENTS } from "../lib/contract";
import { MAX_SLOTS_PER_TEAM } from "../lib/roster";
import type { Instrument, Member, Team, TeamSlot } from "../lib/contract";
import { SectionHead } from "./SettingsForm";
import "../styles/teams.css";


type Counts = Record<string, number>;

const NO_SLOTS: Counts = Object.fromEntries(INSTRUMENTS.map((name) => [name, 0]));

/** 서버에서 받은 포지션 목록을 포지션별 자리 수로 집계합니다. 아직 받지 못했으면 null입니다. */
function countsFromSlots(data: { slots: TeamSlot[] } | undefined): Counts | null {
  if (data === undefined) return null;
  return data.slots.reduce(
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

/** 팀 이름과 포지션 구성을 함께 수정합니다.
 *
 *  포지션 구성은 저장할 때 통째로 다시 계산됩니다. 이미 멤버가 배정된 (포지션, 번호) 포지션은 그대로 유지되므로,
 *  드럼을 1개에서 2개로 늘려도 기존에 드럼을 담당하던 멤버는 포지션을 잃지 않습니다.
 *  포지션 수를 줄이면 번호가 큰 포지션부터 삭제되며, 그 포지션에 있던 멤버는 팀에서 제거됩니다. */
function EditTeam(props: {
  team: Team;
  taken: string[];
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const { team, taken, onDone, onClose } = props;
  const client = useQueryClient();
  const [name, setName] = useState(team.name);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [bad, setBad] = useState("");

  // 현재 포지션 구성을 서버에서 받아 그대로 표시합니다. 화면에서 값을 임의로 생성하지 않습니다.
  const slots = useQuery({
    queryKey: ["slots", team.id],
    queryFn: () => getJSON<{ slots: TeamSlot[] }>(`/teams/${team.id}/slots`),
  });

  // 사용자가 아직 수정하지 않았으면 서버 구성을 그대로 표시합니다. state로 복사하지 않습니다.
  // 복사하면 "받았지만 아직 적용 전" 상태가 생기기 때문입니다.
  const shownCounts = counts ?? countsFromSlots(slots.data);

  const total = Object.values(shownCounts ?? NO_SLOTS).reduce((sum, count) => sum + count, 0);

  const save = useMutation({
    mutationFn: async () => {
      if (name.trim() !== team.name) {
        await getJSON(`/teams/${team.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim() }),
        });
      }
      await getJSON(`/teams/${team.id}/slots`, {
        method: "PUT",
        body: JSON.stringify({ slots: shownCounts }),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["teams"] });
      void client.invalidateQueries({ queryKey: ["slots", team.id] });
      onDone(`${name.trim()} 수정을 완료했어요.`);
    },
    onError: (error) => setBad(reason(error)),
  });

  return (
    <Modal title="팀 수정" hint="팀 정보를 수정할 수 있어요" onClose={onClose}
      foot={
        <>
          <button className="ghost" onClick={onClose}>취소</button>
          <button
            className="primary"
            disabled={save.isPending || shownCounts === null}
            onClick={() => {
              const why = checkTeamName(name, taken) || checkSlotCounts(shownCounts ?? NO_SLOTS);
              setBad(why);
              if (why === "") save.mutate();
            }}
          >
            {save.isPending ? "저장하는 중…" : "저장"}
          </button>
        </>
      }
    >
      <div className="fields">
        <label className="wide" htmlFor="teamRename">
          팀 이름
          <input
            id="teamRename"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </div>

      {shownCounts === null ? (
        <p className="empty">불러오는 중…</p>
      ) : (
        <>
          {INSTRUMENTS.map((instrument) => (
            <Stepper
              key={instrument}
              label={instrument}
              value={shownCounts[instrument] ?? 0}
              min={0}
              max={(shownCounts[instrument] ?? 0) + Math.max(0, MAX_SLOTS_PER_TEAM - total)}
              onChange={(next) => setCounts({ ...shownCounts, [instrument]: next })}
            />
          ))}
          <p className="note">포지션 {total}개</p>
        </>
      )}
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Modal>
  );
}

/** 선택한 팀의 포지션 구성입니다. 빈 포지션도 함께 표시됩니다. 채워야 할 자리를 명확히 보여주는 것이 이 화면의 목적입니다. */
function Lineup(props: {
  teamId: number;
  /** 빈 포지션에 멤버를 배정할 수 있는지 여부입니다. */
  canAdd: boolean;
  /** 멤버가 배정된 포지션을 비울 수 있는지 여부입니다. */
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

/** 생성 중인 포지션 하나입니다. 아직 저장 전이므로 ID가 없으며, 포지션과 번호로만 식별됩니다. */
type Draft = { instrument: Instrument; ordinal: number; label: string; member: Member | null };

/** 지정한 개수만큼 포지션을 전개합니다. 같은 포지션이 1자리뿐이면 번호를 제거하고 "드럼" 으로만 표시합니다. */
function spread(counts: Counts): Draft[] {
  return INSTRUMENTS.flatMap((instrument) => {
    const count = counts[instrument] ?? 0;
    return Array.from({ length: count }, (_unused, index) => ({
      instrument,
      ordinal: index + 1,
      label: slotName(instrument, index + 1, count),
      member: null,
    }));
  });
}

/** 팀을 생성합니다. 두 단계의 프로세스입니다. 먼저 포지션마다 필요한 인원 수를 지정하고, 그 다음 각 포지션에 멤버를 배정합니다.
 *
 *  저장은 마지막에 한 번에 일어납니다. 서버는 팀과 포지션을 함께 생성하고(POST /teams), 멤버는
 *  각 포지션별로 따로 배정하므로(PUT .../slots/{id}), 팀 생성 후 포지션 목록을 받아 포지션·번호로
 *  대응시켜 채웁니다. 포지션 순서를 가정하지 않는 이유는, 서버가 정렬 방식을 바꿔도 동작하게 하기 위함입니다. */
function NewTeam(props: { taken: string[]; onDone: (message: string) => void; onClose: () => void }) {
  const { taken, onDone, onClose } = props;
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Counts>(NO_SLOTS);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [seeking, setSeeking] = useState<number | null>(null);
  const [bad, setBad] = useState("");

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const create = useMutation({
    mutationFn: async (seats: Draft[]) => {
      const made = await getJSON<{ team: Team }>("/teams", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), slots: counts }),
      });
      const teamId = made.team.id;
      const saved = await getJSON<{ slots: TeamSlot[] }>(`/teams/${teamId}/slots`);
      for (const seat of seats) {
        if (seat.member === null) continue;
        const slot = saved.slots.find(
          (row) => row.instrument === seat.instrument && row.ordinal === seat.ordinal,
        );
        if (slot === undefined) continue;
        await getJSON(`/teams/${teamId}/slots/${slot.id}`, {
          method: "PUT",
          body: JSON.stringify({ member_id: seat.member.id }),
        });
      }
      return made.team;
    },
    onSuccess: (team) => {
      void client.invalidateQueries({ queryKey: ["teams"] });
      onDone(`${team.name} 팀 생성을 완료했어요.`);
    },
    onError: (error) => setBad(reason(error)),
  });

  // 1단계: 포지션마다 필요한 인원 수를 지정합니다.
  if (drafts === null) {
    return (
      <Modal title="새 팀" hint="포지션별 인원 수를 지정해주세요" onClose={onClose}
        foot={
          <>
            <button className="ghost" onClick={onClose}>취소</button>
            <button
              className="primary"
              onClick={() => {
                const why = checkTeamName(name, taken) || checkSlotCounts(counts);
                setBad(why);
                if (why === "") setDrafts(spread(counts));
              }}
            >
              구성 확정
            </button>
          </>
        }
      >
        <div className="fields">
          <label className="wide" htmlFor="teamName">
            팀 이름
            <input
              id="teamName"
              value={name}
              placeholder="곡 이름"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>

        {INSTRUMENTS.map((instrument) => (
          <Stepper
            key={instrument}
            label={instrument}
            value={counts[instrument] ?? 0}
            min={0}
            max={(counts[instrument] ?? 0) + Math.max(0, MAX_SLOTS_PER_TEAM - total)}
            onChange={(next) => setCounts((now) => ({ ...now, [instrument]: next }))}
          />
        ))}

        <p className="note">포지션 {total}개</p>
        {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
      </Modal>
    );
  }

  // 2단계: 각 포지션에 멤버를 배정합니다. 빈 채로 둔 포지션은 배정되지 않은 상태로 생성됩니다.
  return (
    <Modal title={name.trim()} hint="버튼을 눌러 지정할 멤버를 검색해요" onClose={onClose}
      foot={
        <>
          <button className="ghost" onClick={() => setDrafts(null)}>이전</button>
          <button
            className="primary"
            disabled={create.isPending}
            onClick={() => create.mutate(drafts)}
          >
            {create.isPending ? "만드는 중…" : "팀 생성"}
          </button>
        </>
      }
    >
      <ul className="lineup">
        {drafts.map((draft, index) => (
          <li className={draft.member === null ? "seat open" : "seat"} key={draft.label}>
            <span className="part">{draft.label}</span>
            {draft.member === null ? (
              <span className="who none">멤버가 지정되지 않았어요</span>
            ) : (
              <span className="who">{memberLabel(draft.member.name, draft.member.cohort)}</span>
            )}
            <span className="acts">
              <button
                className="ic"
                aria-label={`${draft.label} 지정할 멤버 찾기`}
                onClick={() => setSeeking(index)}
              >
                <SearchIcon />
              </button>
              {draft.member === null ? null : (
                <button
                  className="btn"
                  onClick={() =>
                    setDrafts((now) =>
                      (now ?? []).map((row, at) => (at === index ? { ...row, member: null } : row)),
                    )
                  }
                >
                  삭제
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}

      {seeking === null ? null : (
        <Modal title="멤버 검색" hint={drafts[seeking]?.label} onClose={() => setSeeking(null)}>
          <MemberSearch
            onPick={(member) => {
              setDrafts((now) =>
                (now ?? []).map((row, at) => (at === seeking ? { ...row, member } : row)),
              );
              setSeeking(null);
            }}
          />
        </Modal>
      )}
    </Modal>
  );
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
      // 삭제된 팀의 포지션 구성이 열려 있으면 함께 닫습니다.
      setOpenId((now) => (now === team.id ? null : now));
      void client.invalidateQueries({ queryKey: ["teams"] });
      say(`${team.name} 팀을 삭제했어요.`);
    },
    onError: (error) => say(reason(error)),
  });

  const teams = useTeams();
  const list = teams.data?.teams ?? [];
  const canCreate = can(me, "team_create");
  const canRename = can(me, "team_edit");
  const canDrop = can(me, "team_delete");
  const state = loadState(teams);
  // 목록을 렌더링할 수 없는 경우입니다. 아직 데이터를 받지 못했거나, 오류가 발생했거나, 데이터가 비어 있을 때입니다.
  const noList = state.kind !== "ready" || list.length === 0;

  // 한 페이지에 표시할 행 개수는 컨테이너 높이에 따라 결정됩니다. 목록은 스크롤하지 않고 페이지로 넘깁니다.
  const [box, perPage] = useFitCount(64);
  const pages = pageCount(list.length, perPage);
  const shownPage = clampPage(page, pages);
  const opened = list.find((team) => team.id === openId) ?? null;

  return (
    <AppShell
      page="teams"
      current="find-team"
    >
      <div className="main">
        <Card>
          <SectionHead title="팀" desc="팀을 눌러 포지션을 확인해주세요" />

          {/* 데이터가 비어 있거나 로딩 중이어도 컨테이너는 그대로 유지합니다. 컨테이너 높이를 측정하여 한 페이지의 행 수를 결정하므로,
              컨테이너가 사라지면 측정할 대상이 없어집니다. */}
          <ul className="rows" ref={box}>
            {noList ? (
              <li className="empty">{stateText(state, "아직 생성된 팀이 없어요.")}</li>
            ) : (
              pageSlice(list, shownPage, perPage).map((team) => (
                <li key={team.id}>
                  <TeamRow
                    team={team}
                    selected={team.id === openId}
                    mine={teamIds.includes(team.id)}
                    onOpen={() => setOpenId(team.id)}
                    onRename={canRename ? () => setRenaming(team) : undefined}
                    onDelete={!canDrop ? undefined : () => { if (askDelete(team.name)) drop.mutate(team); }}
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

      {!making ? null : (
        <NewTeam
          taken={list.map((team) => team.name)}
          onClose={() => setMaking(false)}
          onDone={(text) => { setMaking(false); say(text); }}
        />
      )}

      {renaming === null ? null : (
        <EditTeam
          team={renaming}
          taken={list.filter((team) => team.id !== renaming.id).map((team) => team.name)}
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
