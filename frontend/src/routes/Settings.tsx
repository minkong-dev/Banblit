// 관리자 메뉴의 진입점입니다. 주소가 고른 구역 1개를 그리고, 합주실·기간 구역에는
// 오른쪽 계산 패널을 함께 표시합니다.
// 합주실·기간·멤버·예약·블라인드·불가능 일정 구역은 각각 Settings*.tsx 가 담당하고,
// 구역 목록과 주소는 lib/adminMenu.ts 가 정본입니다.
// 자기 계정에 대한 설정(이름·사진·비밀번호·테마·탈퇴)은 2026-09-23 에 프로필 화면(/profile)으로 옮겼습니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router-dom";

import { Card, Panel, SectionHead } from "../components/Layout";
import { Dropdown } from "../components/Dropdown";
import { useMe, usePeriods, useRooms, useSettings, useSlotMinutes, useTeams } from "../components/queries";
import { can } from "../lib/account";
import { ADMIN_MENU } from "../lib/adminMenu";
import type { AdminSection } from "../lib/adminMenu";
import { reason } from "../lib/api";
import type { Period, Room, Team } from "../lib/contract";
import { LOADING_TEXT, loadState } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { daysBetween, openingHours, PERIOD_DELETE_KEYS, ROOM_DELETE_KEYS, saveSettings } from "../lib/pipeline";
import {
  DAILY_MAX_HOUR_CHOICES,
  SLOT_MINUTE_CHOICES,
  sessionMinuteChoices,
  sessionMinutesLabel,
  slotMinutesLabel,
} from "../lib/settings";
import { say } from "../lib/toast";
import { BlindedCards } from "./SettingsBlinded";
import { Cell } from "./SettingsForm";
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

/** 관리자 메뉴 1개입니다. 어느 구역을 그릴지는 주소가 정합니다(App.tsx). */
export function SettingsPage({ section }: { section: AdminSection }) {
  const client = useQueryClient();
  const { me } = useMe();

  const needs = ADMIN_MENU.find((item) => item.key === section)?.needs ?? [];
  // me 가 null 인 동안은 판정하지 않습니다. 아직 받지 못한 것을 "권한 없음" 으로 읽으면
  // 화면을 열 때마다 다른 화면으로 이동됩니다.
  const blocked = me !== null && !needs.some((need) => can(me, need));

  const shown = section;
  // 합주실·기간 구역만 이 3개를 사용합니다. 구역마다 주소가 따로 있어 구역을 옮기면 이 화면이
  // 다시 마운트되는데, 가드가 없으면 멤버·예약·블라인드·불가능 일정 구역을 열 때마다
  // 쓰지 않는 목록 3건을 요청합니다. 권한이 없어 바로 되돌려보내는 경우에도 마찬가지입니다.
  const needsSetup = !blocked && (shown === "rooms" || shown === "periods");
  const rooms = useRooms(needsSetup);
  const periods = usePeriods(needsSetup);
  // 팀 목록은 오른쪽 계산에만 사용합니다. queryKey 가 다른 화면에서 사용하는 것과 같아서,
  // 이미 받은 목록이 있으면 다시 조회하지 않습니다.
  const teams = useTeams(needsSetup);

  const roomList = rooms.data?.rooms ?? [];
  const periodList = periods.data?.periods ?? [];
  const teamList = teams.data?.teams ?? [];

  // 저장이 끝나면 목록을 서버에서 다시 조회합니다. 화면은 서버에서 받은 값만 표시합니다.
  // keys 가 여럿이면 전부 무효화합니다 — 삭제로 서버가 CASCADE 삭제하는 데이터의 캐시까지
  // 함께 무효화할 때 씁니다(PERIOD_DELETE_KEYS, ROOM_DELETE_KEYS).
  function saved(keys: string | readonly string[], text: string): () => void {
    return () => {
      for (const key of typeof keys === "string" ? [keys] : keys) {
        void client.invalidateQueries({ queryKey: [key] });
      }
      say(text);
    };
  }

  // 권한 없이 주소로 바로 들어온 경우입니다. 빈 화면을 두지 않고, 열 수 있는 첫 구역이나
  // 안내 문구로 보냅니다(SettingsIndex).
  if (blocked) return <Navigate to="/settings" replace />;

  return (
    <>
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
              onDeleted={saved(ROOM_DELETE_KEYS, "합주실을 삭제했어요.")}
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
            onDeleted={saved(PERIOD_DELETE_KEYS, "집중 합주기간을 삭제했어요.")}
          />
        ) : shown === "members" ? (
          <MemberCards />
        ) : shown === "reservations" ? (
          <ReservationCards />
        ) : shown === "blinded" ? (
          <BlindedCards />
        ) : (
          <UnavailableCards />
        )}
      </div>

      {/* 오른쪽 계산 패널은 합주실·기간 구역에만 붙습니다. 그 둘만 설정값이 배정에 미치는 영향을 미리 봐야 합니다. */}
      {shown !== "rooms" && shown !== "periods" ? null : (
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
    </>
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
  const { slotMinutes, sessionMinutes, dailyMaxHours } = useSettings();
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
        {/* 배정 계산이 팀 하나에 하루 이 시간까지만 배정합니다. 상한이 없으면 팀의 시간이 하루에 전부 몰립니다. */}
        <Cell label="팀당 하루 최대" htmlFor="dailyMax">
          <Dropdown
            id="dailyMax"
            value={dailyMaxHours}
            disabled={!canEdit || save.isPending}
            invalid={why !== ""}
            describedBy={why === "" ? undefined : "slotUnitWhy"}
            choices={DAILY_MAX_HOUR_CHOICES.map((hours) => ({ value: hours, label: `${hours}시간` }))}
            onChange={(next) => save.mutate({ dailyMaxHours: next })}
          />
        </Cell>
        {why === "" ? null : <p className="why" id="slotUnitWhy" role="alert">{why}</p>}
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
            ? "집중합주 기간에는 모든 팀이 같은 합주 횟수를 갖도록 스케줄링을 진행해요."
            : "현재 생성된 팀이 없어요."}
        </p>
      </div>
    </Panel>
  );
}
