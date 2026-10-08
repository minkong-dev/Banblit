// 관리자 메뉴의 예약 구역입니다. 모든 멤버의 다가오는 예약을 한 표에서 봅니다. 본인 예약은 바로 취소하고,
// 다른 멤버의 예약은 반려 사유를 적어 취소합니다(그 멤버에게 사유가 알림으로 갑니다).
// "타 멤버 예약 수정 및 취소"(reservation_manage) 권한자에게만 이 구역이 표시됩니다.
// 서버도 같은 권한으로 반려를 받습니다(services/reservation/reservation_service.py 의 reject_reservation).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty } from "../components/controls";
import { Card, SectionHead } from "../components/Layout";
import { RejectDialog } from "../components/RejectDialog";
import { useMe, useRooms } from "../components/queries";
import { reason } from "../lib/api";
import { askCancel } from "../lib/confirm";
import {
  cancelBooking,
  dayKey,
  dayWithWeekday,
  hhmm,
  loadReservationRows,
  rejectBooking,
  upcomingBookings,
} from "../lib/pipeline";
import type { Booking } from "../lib/pipeline";
import { say } from "../lib/toast";
import { loadState } from "../lib/loading";

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
  const { me } = useMe();
  const rooms = useRooms();
  // 반려 사유 modal 을 연 예약입니다. null 이면 modal 이 닫혀 있습니다.
  const [rejecting, setRejecting] = useState<Booking | null>(null);
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
  const state = loadState(list);

  return (
    <Card>
      <SectionHead title="예약" desc={`${WINDOW_DAYS}일 내에 발생한 모든 예약을 불러왔어요.`} />

      <div className="roster">
        {rooms.isError ? <Empty text={reason(rooms.error)} /> : null}
        {failures.map((text) => <Empty key={text} text={text} />)}
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
                  {booking.memberId === me?.id ? (
                    <Button
                      kind="ghost"
                      // 취소 중인 행만 비활성화합니다. 다른 행까지 비활성화하면 어느 예약이 삭제 진행 중인지 사용자가 알 수 없습니다.
                      disabled={cancel.isPending && cancel.variables?.id === booking.id}
                      aria-label={`${bookingLabel(booking)} 취소`}
                      onClick={() => { if (askCancel(bookingLabel(booking))) cancel.mutate(booking); }}
                    >
                      취소
                    </Button>
                  ) : (
                    <Button kind="ghost" aria-label={`${bookingLabel(booking)} 반려`} onClick={() => setRejecting(booking)}>
                      반려
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rooms.data !== undefined && (state.kind === "loading" || (state.kind === "ready" && bookings.length === 0)) ? (
          <Empty state={state} text="현재 예약이 없어요" />
        ) : null}
      </div>

      {rejecting === null ? null : (
        <RejectDialog
          target="reservation"
          owner={rejecting.member}
          subject={`${dayWithWeekday(rejecting.start.slice(0, 10))} ${hhmm(rejecting.start)}–${hhmm(rejecting.end)} ${rejecting.room}`}
          onReject={(text) => rejectBooking(rejecting.id, text)}
          onDone={() => {
            setRejecting(null);
            void client.invalidateQueries({ queryKey: ["reservations"] });
            say("예약을 반려했어요");
          }}
          onClose={() => setRejecting(null)}
        />
      )}
    </Card>
  );
}
