// 관리자 메뉴 구역의 화면 표와 권한 확인입니다. 구역 목록과 주소는 lib/adminMenu.ts 에 작성되어 있는 내용을 기준으로 하고,
// 구역마다 화면은 Settings*.tsx 가 담당합니다. 자기 계정에 대한 설정은 프로필 화면(/profile)에 있습니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { Card, Panel, SectionHead } from "../components/Layout";
import { Dropdown } from "../components/Dropdown";
import { PERIOD_DELETE_KEYS, ROOM_DELETE_KEYS, useMe, usePeriods, useRooms, useSettings, useSlotMinutes, useTeams } from "../components/queries";
import { can } from "../lib/account";
import { ADMIN_MENU } from "../lib/adminMenu";
import type { AdminSection } from "../lib/adminMenu";
import { reason } from "../lib/api";
import type { Period, Room, Team } from "../lib/contract";
import { LOADING_TEXT, loadState } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { daysBetween, openingHours, saveSettings } from "../lib/pipeline";
import {
  SLOT_MINUTE_CHOICES,
  sessionMinuteChoices,
  sessionMinutesLabel,
  slotMinutesLabel,
} from "../lib/settings";
import { say } from "../components/toast";
import { BlindedCards } from "./SettingsBlinded";
import { Cell, Why } from "../components/controls";
import { MemberCards } from "./SettingsMembers";
import { PeriodCard } from "./SettingsPeriods";
import { ReservationCards } from "./SettingsReservations";
import { RoomCard } from "./SettingsRooms";
import { UnavailableCards } from "./SettingsUnavailable";
import "../styles/settings.css";


/** /settings 주소입니다. 관리자 메뉴를 구역별 주소로 분리하기 전의 주소라, 저장해 둔 링크가 끊기지 않게
 *  가진 권한으로 열 수 있는 첫 구역으로 보냅니다. 권한 없이 구역 주소로 바로 들어온 경우도 이곳으로 옵니다. */
export function SettingsIndex() {
  const { me } = useMe();
  // 계정을 아직 받지 못했으면 판정하지 않습니다. 조회가 실패한 경우의 안내는 AppShell 이 표시합니다.
  if (me === null) return null;

  // 권한 항목 하나만 있어도 그 구역을 엽니다. 생성만 할 수 있고 수정할 수 없는 사람도 목록은 봐야 하기 때문입니다.
  const first = ADMIN_MENU.find((item) => item.needs.some((need) => can(me, need)));
  if (first !== undefined) return <Navigate to={first.to} replace />;

  // 관리 권한이 하나도 없으면 표시할 구역이 없습니다. 사이드바에도 관리자 메뉴가 없지만,
  // 주소를 직접 입력해 들어올 수 있어 어디로 가야 하는지 안내합니다.
  return (
    <div className="main">
      <Card>
        <div className="empty">
          설정할 수 있는 항목이 없어요. 내 계정은 프로필 화면에서 수정해요.
        </div>
      </Card>
    </div>
  );
}

/** 관리자 메뉴 구역 1개의 권한 확인입니다. 계정을 받기 전에는 판정하지 않습니다. 아직 받지 못한 것을 "권한 없음" 으로
 *  읽으면 화면을 열 때마다 다른 화면으로 이동됩니다. 권한이 없으면 SettingsIndex 로 보내 열 수 있는 첫 구역이나 안내를 표시합니다. */
export function AdminArea({ section, children }: { section: AdminSection; children: ReactNode }) {
  const { me } = useMe();
  const needs = ADMIN_MENU.find((item) => item.key === section)?.needs ?? [];
  if (me !== null && !needs.some((need) => can(me, need))) return <Navigate to="/settings" replace />;
  return <>{children}</>;
}

/** 합주실, 기간 구역입니다. 두 구역만 설정값이 배정에 미치는 영향을 오른쪽 계산 패널에서 미리 봅니다. */
function SetupArea({ tab }: { tab: "rooms" | "periods" }) {
  const client = useQueryClient();
  const { me } = useMe();
  const rooms = useRooms();
  const periods = usePeriods();
  // 팀 목록은 오른쪽 계산에만 씁니다. 다른 화면과 queryKey 가 같아 이미 받은 목록이 있으면 다시 조회하지 않습니다.
  const teams = useTeams();
  const roomList = rooms.data?.rooms ?? [];
  const periodList = periods.data?.periods ?? [];

  // 저장이 끝나면 keys 의 목록을 서버에서 다시 조회합니다. 삭제는 서버가 CASCADE 로 함께 삭제한 데이터의 key 까지 넘깁니다.
  function saved(keys: readonly string[], text: string): () => void {
    return () => {
      for (const key of keys) void client.invalidateQueries({ queryKey: [key] });
      say(text);
    };
  }

  return (
    <>
      <div className="main">
        {tab === "rooms" ? (
          <>
            <RoomCard
              rooms={roomList}
              state={loadState(rooms)}
              canEdit={can(me, "room_edit")}
              canCreate={can(me, "room_create")}
              canDelete={can(me, "room_delete")}
              onSaved={saved(["rooms"], "합주실 정보를 등록했어요.")}
              onDeleted={saved(ROOM_DELETE_KEYS, "합주실을 삭제했어요.")}
            />
            <SlotUnitCard canEdit={can(me, "room_edit")} onSaved={saved(["settings"], "설정을 변경했어요.")} />
          </>
        ) : (
          <PeriodCard
            periods={periodList}
            rooms={roomList}
            state={loadState(periods)}
            canEdit={can(me, "period_edit")}
            canCreate={can(me, "period_create")}
            canDelete={can(me, "period_delete")}
            onSaved={saved(["periods"], "집중 합주기간을 등록했어요.")}
            onDeleted={saved(PERIOD_DELETE_KEYS, "집중 합주기간을 삭제했어요.")}
          />
        )}
      </div>
      <div className="rail">
        <Readout rooms={roomList} periods={periodList} teams={teams.data?.teams ?? []} teamsState={loadState(teams)} tab={tab} />
      </div>
    </>
  );
}

/** 관리자 메뉴 구역마다 그릴 화면입니다. App.tsx 가 lib/adminMenu.ts 의 주소마다 AdminArea 로 감싸 연결합니다. */
export const ADMIN_SCREENS: Record<AdminSection, ReactElement> = {
  rooms: <SetupArea tab="rooms" />,
  periods: <SetupArea tab="periods" />,
  members: <div className="main"><MemberCards /></div>,
  reservations: <div className="main"><ReservationCards /></div>,
  blinded: <div className="main"><BlindedCards /></div>,
  unavailable: <div className="main"><UnavailableCards /></div>,
};

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
        <Why text={why} id="slotUnitWhy" />
      </div>
    </Card>
  );
}

/** 팀 목록이 성공적으로 조회되면 팀 수와 배정된 인원 수를 반환합니다. 그렇지 않을 경우 조회할 수 없는 이유를 반환합니다. */
function teamLine(teams: Team[], state: LoadState): string {
  if (state.kind === "loading") return LOADING_TEXT;
  if (state.kind === "failed") return state.why;
  const filled = teams.reduce((sum, team) => sum + team.filled_count, 0);
  const slots = teams.reduce((sum, team) => sum + team.slot_count, 0);
  return `팀 ${teams.length}개, 포지션 ${slots}개 중 ${filled}명 배정됨`;
}

/** 현재 설정에서 실제로 얼마가 개방되는지를 표시합니다. 집중 합주기간은 모든 팀이 같은 배정을 받아야 합니다. */
function Readout(props: {
  rooms: Room[];
  periods: Period[];
  teams: Team[];
  teamsState: LoadState;
  /** 합주실·기간 중 어느 구역에서 열렸는지입니다. 계산에 쓰는 값이 구역마다 다릅니다. */
  tab: "rooms" | "periods";
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
            ? "집중 합주기간에는 모든 팀이 같은 합주 횟수를 갖도록 스케줄링을 진행해요."
            : "현재 생성된 팀이 없어요."}
        </p>
      </div>
    </Panel>
  );
}
