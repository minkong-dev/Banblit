// 설정 화면의 예약 구역. 모든 멤버의 다가오는 예약을 한 표로 보고, 어느 것이든 취소한다.
// "타 멤버 예약 수정 및 취소"(reservation_manage) 권한자에게만 탭이 열린다 — 서버도 같은
// 권한으로 남의 예약 취소를 받아 준다(reservation_service.py _get_own_reservation).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card } from "../components/AppShell";
import { useRooms } from "../components/hooks";
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

// ponytail: 오늘부터 이 날수만큼만 본다. 예약 목록 endpoint 가 합주실·날짜 범위로만 받아서,
// 합주실마다 한 번씩 차례로 부른다(loadReservationRows). 합주실이 많아져 느려지거나 더 먼
// 예약을 관리해야 하면 전체 목록 endpoint 를 만든다.
const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 표의 예약자 칸과 같은 글자 — 스크린 리더가 읽는 이름과 눈으로 보는 이름이 같아야 한다. */
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
  const from = dayKey(new Date());
  const to = dayKey(new Date(Date.now() + WINDOW_DAYS * DAY_MS));

  // 열쇠 앞머리가 달력(Scheduler)과 같은 "reservations" 라, 어느 쪽에서 취소하든 둘 다 다시 받는다.
  const list = useQuery({
    queryKey: ["reservations", "upcoming", roomIds, from, to],
    queryFn: () => loadReservationRows(roomIds, from, to),
    enabled: rooms.data !== undefined,
  });

  const cancel = useMutation({
    mutationFn: (booking: Booking) => cancelBooking(booking.ids),
    onSettled: () => { void client.invalidateQueries({ queryKey: ["reservations"] }); },
    onSuccess: () => say("예약을 취소했어요"),
    onError: (error) => say(reason(error, "예약을 취소하지 못했어요")),
  });

  // 서버 규격(Reservation)을 잇기 계산이 받는 모양(ReservationSlot)으로 바꾼다 — 달력(Scheduler)과 같은 손질이다.
  const bookings = upcomingBookings((list.data?.rows ?? []).map((row) => ({
    id: row.id,
    room: row.room,
    teamId: row.team_id,
    team: row.team,
    memberId: row.member_id,
    member: row.member,
    start: row.start,
    end: row.end,
  })));
  const failures = list.data?.failures ?? [];

  return (
    <Card>
      <div className="sethead">
        <b>예약</b>
        <span>{WINDOW_DAYS}일 내에 발생한 모든 예약을 불러왔어요.</span>
      </div>

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
              <tr key={booking.ids[0]}>
                <td>{dayWithWeekday(booking.start.slice(0, 10))}</td>
                <td>{hhmm(booking.start)}–{hhmm(booking.end)}</td>
                <td>{booking.room}</td>
                <td>{whoLabel(booking)}</td>
                <td className="fill" />
                <td>
                  <button
                    className="btn"
                    // 누른 줄만 잠근다. 다른 줄까지 잠그면 어느 것이 지워지는 중인지 알 수 없다.
                    disabled={cancel.isPending && cancel.variables?.ids[0] === booking.ids[0]}
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
        {list.isPending && rooms.data !== undefined ? <p className="empty">예약을 내역을 불러오고 있어요.</p> : null}
        {list.isSuccess && bookings.length === 0 ? <p className="empty">현재 예약이 없어요</p> : null}
      </div>
    </Card>
  );
}
