// 설정 화면의 진입점입니다. 탭을 고르고, 고른 탭의 구역을 그리고, 오른쪽 계산 패널을 표시합니다.
// 합주실·기간·멤버·예약·블라인드·계정 구역은 각각 Settings*.tsx 가 담당합니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { Dropdown } from "../components/Dropdown";
import { useMe, usePeriods, useRooms, useSettings, useSlotMinutes, useTeams } from "../components/queries";
import { can } from "../lib/account";
import { reason } from "../lib/api";
import type { Period, Room, Team } from "../lib/contract";
import { loadState } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { daysBetween, openingHours, saveSettings } from "../lib/pipeline";
import {
  SLOT_MINUTE_CHOICES,
  sessionMinuteChoices,
  sessionMinutesLabel,
  slotMinutesLabel,
} from "../lib/settings";
import { applyTheme, readSavedTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { say } from "../lib/toast";
import { AccountCards } from "./SettingsAccount";
import { BlindedCards } from "./SettingsBlinded";
import { Cell, SectionHead } from "./SettingsForm";
import { MemberCards } from "./SettingsMembers";
import { PeriodCard } from "./SettingsPeriods";
import { ReservationCards } from "./SettingsReservations";
import { RoomCard } from "./SettingsRooms";
import "../styles/settings.css";


type Tab = "rooms" | "periods" | "members" | "reservations" | "blinded" | "account";

// 탭마다 필요한 권한 항목이 다릅니다. 가진 권한의 탭만 표시되므로, 관리 권한이 없는 사람에게는 계정 탭 하나만 남습니다.
// 내 정보·비밀번호·화면 밝기·탈퇴는 전부 자기 계정에 대한 설정이라 한 탭에 둡니다.
// needs가 없는 탭은 로그인한 모든 사람이 볼 수 있습니다.
const TABS = [
  { key: "rooms" as const, text: "합주실", needs: ["room_create", "room_edit", "room_delete"] as const },
  { key: "periods" as const, text: "기간", needs: ["period_create", "period_edit", "period_delete"] as const },
  { key: "members" as const, text: "멤버", needs: ["permission_manage", "permission_grant"] as const },
  { key: "reservations" as const, text: "예약", needs: ["reservation_manage"] as const },
  { key: "blinded" as const, text: "블라인드", needs: ["board_moderate"] as const },
  { key: "account" as const, text: "계정", needs: null },
];

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

export function Settings() {
  const [tab, setTab] = useState<Tab>("rooms");
  const client = useQueryClient();
  const { me } = useMe();

  // 권한 항목 하나만 있어도 그 탭을 엽니다. 생성만 할 수 있고 수정할 수 없는 사람도 목록은 봐야 하기 때문입니다.
  const tabs = TABS.filter(
    (item) => item.needs === null || item.needs.some((need) => can(me, need)),
  );
  // 권한을 잃은 채로 그 탭에 머물러 있지 않게, 없는 탭이면 남은 탭 중 첫 탭을 표시합니다.
  // 계정 탭은 모든 사람이 볼 수 있으므로 tabs가 비는 일은 없습니다.
  const shown: Tab = tabs.some((item) => item.key === tab) ? tab : tabs[0].key;

  const rooms = useRooms();
  const periods = usePeriods();
  // 팀 목록은 오른쪽 계산에만 사용합니다. queryKey 가 다른 화면에서 사용하는 것과 같아서,
  // 이미 받은 목록이 있으면 다시 조회하지 않습니다.
  const teams = useTeams();

  const roomList = rooms.data?.rooms ?? [];
  const periodList = periods.data?.periods ?? [];
  const teamList = teams.data?.teams ?? [];

  // 저장이 끝나면 목록을 서버에서 다시 조회합니다. 화면은 서버에서 받은 값만 표시합니다.
  function saved(key: string, text: string): () => void {
    return () => {
      void client.invalidateQueries({ queryKey: [key] });
      say(text);
    };
  }

  return (
    <AppShell
      page="settings"
      current="settings"
    >
      <Tabs label="설정" items={tabs} selected={shown} onSelect={setTab} />

      <div className="main">
        {shown === "rooms" ? (
          <>
            <RoomCard
              rooms={roomList}
              state={loadState(rooms)}
              canEdit={can(me, "room_edit")}
              canCreate={can(me, "room_create")}
              canDelete={can(me, "room_delete")}
              onSaved={saved("rooms", "합주실 정보를 등록했어요.")}
              onDeleted={saved("rooms", "합주실을 삭제했어요.")}
            />
            <SlotUnitCard
              canEdit={can(me, "room_edit")}
              onSaved={saved("settings", "설정을 변경했어요.")}
            />
          </>
        ) : shown === "periods" ? (
          <PeriodCard
            periods={periodList}
            rooms={roomList}
            state={loadState(periods)}
            canEdit={can(me, "period_edit")}
            canCreate={can(me, "period_create")}
            canDelete={can(me, "period_delete")}
            onSaved={saved("periods", "집중 합주기간을 등록했어요.")}
            onDeleted={saved("periods", "집중 합주기간을 삭제했어요.")}
          />
        ) : shown === "members" ? (
          <MemberCards />
        ) : shown === "reservations" ? (
          <ReservationCards />
        ) : shown === "blinded" ? (
          <BlindedCards />
        ) : (
          <AccountCards theme={<ThemeCard />} />
        )}
      </div>

      {shown === "members" || shown === "reservations" || shown === "blinded" || shown === "account" ? null : (
        <div className="rail">
          <Readout
            rooms={roomList}
            periods={periodList}
            teams={teamList}
            teamsState={loadState(teams)}
            tab={shown}
          />
        </div>
      )}
    </AppShell>
  );
}

/** 점유 단위(칸 하나의 크기)와 합주 1회 길이를 변경하는 카드입니다. 합주실 운영을 맡은 사람의
 *  설정이라 합주실 탭에 둡니다. 권한(room_edit)이 없으면 현재 값만 표시합니다.
 *  변경해도 이미 저장된 예약과 배정은 그대로 남습니다.
 *
 *  두 값은 서로를 제약합니다 — 합주 길이는 칸의 배수여야 합주가 칸 중간에서 끝나지 않습니다.
 *  칸을 키우면 저장된 합주 길이가 배수가 아니게 될 수 있어, 그때는 합주 길이를 함께 보내
 *  한 요청으로 맞춥니다. 나눠 보내면 어느 쪽을 먼저 보내도 중간 상태가 거절됩니다. */
function SlotUnitCard({ canEdit, onSaved }: { canEdit: boolean; onSaved: () => void }) {
  const { slotMinutes, sessionMinutes } = useSettings();
  const [why, setWhy] = useState("");
  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => { setWhy(""); onSaved(); },
    onError: (error: unknown) => setWhy(reason(error)),
  });

  // 칸을 바꿀 때 저장된 합주 길이가 그 배수가 아니면, 새 칸에서 고를 수 있는 가장 가까운
  // 길이로 함께 내립니다. 사용자가 두 값의 관계를 외우지 않아도 됩니다.
  const changeSlot = (next: number) => {
    const fits = sessionMinutes >= next && sessionMinutes % next === 0;
    save.mutate(fits ? { slotMinutes: next } : { slotMinutes: next, sessionMinutes: next });
  };

  return (
    <Card>
      <SectionHead title="점유 단위" desc="변경해도 등록된 예약과 배정은 그대로 남아요" />
      <div className="fields">
        <Cell label="단위" htmlFor="slotUnit">
          <Dropdown
            id="slotUnit"
            value={slotMinutes}
            disabled={!canEdit || save.isPending}
            invalid={why !== ""}
            describedBy={why === "" ? undefined : "slotUnitWhy"}
            choices={SLOT_MINUTE_CHOICES.map((minutes) => ({
              value: minutes,
              label: slotMinutesLabel(minutes),
            }))}
            onChange={changeSlot}
          />
        </Cell>
        <Cell label="합주 1회" htmlFor="sessionLength">
          <Dropdown
            id="sessionLength"
            value={sessionMinutes}
            disabled={!canEdit || save.isPending}
            invalid={why !== ""}
            describedBy={why === "" ? undefined : "slotUnitWhy"}
            choices={sessionMinuteChoices(slotMinutes).map((minutes) => ({
              value: minutes,
              label: sessionMinutesLabel(minutes),
            }))}
            onChange={(next) => save.mutate({ sessionMinutes: next })}
          />
        </Cell>
        {why === "" ? null : <p className="why" id="slotUnitWhy" role="alert">{why}</p>}
      </div>
    </Card>
  );
}

/** 팀 목록이 성공적으로 조회되면 팀 수와 배정된 인원 수를 반환합니다. 그렇지 않을 경우 조회할 수 없는 이유를 반환합니다. */
function teamLine(teams: Team[], state: LoadState): string {
  if (state.kind === "loading") return "팀 리스트를 불러오는 중…";
  if (state.kind === "failed") return state.why;
  const filled = teams.reduce((sum, team) => sum + team.filled_count, 0);
  const slots = teams.reduce((sum, team) => sum + team.slot_count, 0);
  return `팀 ${teams.length}개 · 포지션 ${slots}개 중 ${filled}명 배정됨`;
}

/** 현재 설정에서 실제로 얼마가 개방되는지를 표시합니다. 집중 합주기간은 모든 팀이 같은 배정을 받아야 합니다. */
function Readout(props: {
  rooms: Room[];
  periods: Period[];
  teams: Team[];
  teamsState: LoadState;
  tab: Tab;
}) {
  const { rooms, periods, teams, teamsState, tab } = props;
  const slotMinutes = useSlotMinutes();

  // 집중 합주기간이 2개 이상이면 첫 번째 기간만 계산합니다. 어느 기간인지는 아래 날짜로 표시하므로
  // 혼동하지 않습니다. 여러 개를 비교하는 기능은 선택지를 만든 뒤에 추가합니다.
  const focused = periods.filter((period) => period.kind === "focused");
  const period = tab === "periods" ? focused[0] : undefined;
  const days = period ? daysBetween(period.starts_on, period.ends_on) : 1;
  // 팀 수는 팀 목록 endpoint(API의 요청 주소 단위)가 제공합니다. 아직 조회하지 못했으면 0 이며,
  // 이 경우 팀당 배정을 계산하지 않습니다.
  const count = teams.length;
  const sum = openingHours({ rooms, days, teams: count, slotMinutes });

  return (
    <Panel title="해당 설정으로" hint={period ? `${days}일 기준` : "하루 기준"}>
      <div className="read">
        <div className="big">
          {sum.total}
          <small>
            {period
              ? `${period.starts_on} – ${period.ends_on} 동안 개방을 진행해요.`
              : `합주실 ${rooms.length} 전체 총 개방 시간`}
          </small>
        </div>

        <dl>
          <dt>하루</dt>
          <dd>{sum.perDay}</dd>
          {count > 0 ? (
            <>
              <dt>팀당</dt>
              <dd>{sum.perTeam}</dd>
              <dt>균등 배정 후 잔여 시간</dt>
              <dd className="left">{sum.leftover}</dd>
            </>
          ) : null}
        </dl>

        <div className="teams">{teamLine(teams, teamsState)}</div>

        <p className="note">
          {count > 0
            ? "집중합주 기간에는 모든 팀이 같은 합주 횟수를 갖도록 스케줄링을 진행해요."
            : "현재 생성된 팀이 없어요."}
        </p>
      </div>
    </Panel>
  );
}
