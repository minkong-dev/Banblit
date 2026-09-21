// 설정 화면의 예약 구역입니다. 모든 멤버의 다가오는 예약을 한 표에서 보고, 어느 예약이든 취소할 수 있습니다.
// "타 멤버 예약 수정 및 취소"(reservation_manage) 권한자에게만 이 탭이 표시됩니다.
// 서버도 같은 권한으로 다른 멤버의 예약 취소를 받으므로 권한 검증이 일관성 있게 작동합니다(reservation_service.py _get_own_reservation).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card } from "../components/AppShell";
import { useRooms } from "../components/queries";
import { reason } from "../lib/api";
import { askCancel } from "../lib/confirm";
import {
  cancelBooking,
  dayKey,
  dayWithWeekday,
  hhmm,
  loadReservationRows,
  upcomingBookings,
} from "../lib/pipeline";
import type { Booking } from "../lib/pipeline";
import { say } from "../lib/toast";
import { LOADING_TEXT } from "../lib/loading";
import { SectionHead } from "./SettingsForm";

// ponytail: 현재 기준 지정한 일수 범위 내의 예약만 표시합니다. 예약 목록 endpoint(API의 요청 주소 단위)가 합주실·날짜 범위 조건으로만 받으므로,
// 합주실마다 요청을 하나씩 동시에 보냅니다(loadReservationRows). 합주실 수가 증가하여 성능 저하가 발생하거나 더 먼 범위의
// 예약을 관리해야 하면 전체 목록 조회 endpoint를 새로 만듭니다. 그때까지는 현재 방식으로 충분합니다.
const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 표의 예약자 칸과 동일한 텍스트입니다. 스크린 리더가 읽는 이름과 화면에 표시되는 이름이 같아야 합니다. */
function whoLabel(booking: Booking): string {
  return booking.team === null ? booking.member : `${booking.team} (${booking.member})`;
}

function bookingLabel(booking: Booking): string {
  return `${whoLabel(booking)} ${dayWithWeekday(booking.start.slice(0, 10))} ${hhmm(booking.start)}–${hhmm(booking.end)} 예약`;
}

export function ReservationCards() {
  const client = useQueryClient();
  const rooms = useRooms();
  const roomIds = (rooms.data?.rooms ?? []).map((room) => room.id);
  // render 중에 현재 시각을 읽으면 render 마다 값이 달라집니다. 화면을 열 때 한 번만 읽어 고정합니다.
  const [openedAt] = useState(() => Date.now());
  const from = dayKey(new Date(openedAt));
  const to = dayKey(new Date(openedAt + WINDOW_DAYS * DAY_MS));

  // queryKey 앞머리가 달력(Scheduler)과 같은 "reservations"이므로, 어느 쪽에서 취소하든 둘 다 데이터를 refetch합니다.
  const list = useQuery({
    queryKey: ["reservations", "upcoming", roomIds, from, to],
    queryFn: () => loadReservationRows(roomIds, from, to),
    enabled: rooms.data !== undefined,
  });

  const cancel = useMutation({
    mutationFn: (booking: Booking) => cancelBooking(booking.id),
    onSettled: () => { void client.invalidateQueries({ queryKey: ["reservations"] }); },
    onSuccess: () => say("예약을 취소했어요"),
    onError: (error) => say(reason(error, "예약을 취소하지 못했어요")),
  });

  // 서버 규격(Reservation)에서 화면이 쓰는 값만 추립니다. 달력(Scheduler)과 같은 전처리입니다.
  const bookings = upcomingBookings((list.data?.rows ?? []).map((row) => ({
    id: row.id,
    room: row.room,
    teamId: row.team_id,
    team: row.team,
    memberId: row.member_id,
    member: row.member,
    name: row.name,
    start: row.start,
    end: row.end,
  })));
  const failures = list.data?.failures ?? [];

  return (
    <Card>
      <SectionHead title="예약" desc={`${WINDOW_DAYS}일 내에 발생한 모든 예약을 불러왔어요.`} />

      <div className="roster">
        {rooms.isError ? <p className="empty">{reason(rooms.error)}</p> : null}
        {failures.map((text) => <p className="empty" key={text}>{text}</p>)}
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>시간</th>
              <th>합주실</th>
              <th>예약자</th>
              <th className="fill" aria-hidden="true" />
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>{dayWithWeekday(booking.start.slice(0, 10))}</td>
                <td>{hhmm(booking.start)}–{hhmm(booking.end)}</td>
                <td>{booking.room}</td>
                <td>{whoLabel(booking)}</td>
                <td className="fill" />
                <td>
                  <button
                    className="btn"
                    // 취소 중인 행만 비활성화합니다. 다른 행까지 비활성화하면 어느 예약이 삭제 진행 중인지 사용자가 알 수 없습니다.
                    disabled={cancel.isPending && cancel.variables?.id === booking.id}
                    aria-label={`${bookingLabel(booking)} 취소`}
                    onClick={() => { if (askCancel(bookingLabel(booking))) cancel.mutate(booking); }}
                  >
                    취소
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isPending && rooms.data !== undefined ? <p className="empty">{LOADING_TEXT}</p> : null}
        {list.isSuccess && bookings.length === 0 ? <p className="empty">현재 예약이 없어요</p> : null}
      </div>
    </Card>
  );
}
