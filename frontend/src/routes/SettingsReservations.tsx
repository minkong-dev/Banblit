// 관리자 메뉴의 예약 구역입니다. 모든 멤버의 다가오는 예약을 한 표에서 봅니다. 본인 예약은 바로 취소하고,
// 다른 멤버의 예약은 반려 사유를 적어 취소합니다(그 멤버에게 사유가 알림으로 갑니다).
// "타 멤버 예약 수정 및 취소"(reservation_manage) 권한자에게만 이 구역이 표시됩니다.
// 서버도 같은 권한으로 반려를 받습니다(services/reservation/reservation_service.py 의 reject_reservation).

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button, Empty } from "../components/controls";
import { Card, SectionHead } from "../components/Layout";
import { RejectDialog } from "../components/RejectDialog";
import { RESERVATIONS_KEY, useMe, useRooms, useUpcomingReservations } from "../components/queries";
import { reason } from "../lib/api";
import { askCancel } from "../lib/confirm";
import { cancelBooking, rejectBooking } from "../lib/pipeline";
import { say } from "../components/toast";
import { loadState } from "../lib/loading";
import { dayKey, dayWithWeekday } from "../lib/calendar";
import { dayTimeRangeLabel, timeRangeLabel, upcomingBookings } from "../lib/slots";
import type { Reservation } from "../lib/contract";

// ponytail: 현재 기준 지정한 일수 범위 내의 예약만 표시합니다. 예약 목록 endpoint(API 의 요청 주소 단위)가 합주실, 날짜 범위 조건으로만 받으므로,
// 합주실마다 요청을 하나씩 동시에 보냅니다(loadReservationRows). 합주실 수가 증가하여 성능 저하가 발생하거나 더 먼 범위의
// 예약을 관리해야 하면 전체 목록 조회 endpoint 를 새로 만듭니다. 그때까지는 현재 방식으로 충분합니다.
const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 표의 예약자 칸과 동일한 텍스트입니다. 스크린 리더가 읽는 이름과 화면에 표시되는 이름이 같아야 합니다. */
function whoLabel(booking: Reservation): string {
  return booking.team === null ? booking.member : `${booking.team} (${booking.member})`;
}

function bookingLabel(booking: Reservation): string {
  return `${whoLabel(booking)} ${dayTimeRangeLabel(booking.start, booking.end)} 예약`;
}

/** 다가오는 예약 표입니다. 마지막 열은 본인 예약이면 취소, 다른 멤버의 예약이면 반려 버튼입니다. */
function ReservationTable({ bookings, meId, cancelingId, onCancel, onReject }: {
  bookings: Reservation[];
  meId: number | null;
  /** 취소 요청이 진행 중인 예약 번호입니다. 그 행의 버튼만 비활성화합니다. 전부 비활성화하면 어느 예약이 진행 중인지 알 수 없습니다. */
  cancelingId: number | null;
  onCancel: (booking: Reservation) => void;
  onReject: (booking: Reservation) => void;
}) {
  return (
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
            <td>{timeRangeLabel(booking.start, booking.end)}</td>
            <td>{booking.room}</td>
            <td>{whoLabel(booking)}</td>
            <td className="fill" />
            <td>
              {booking.member_id === meId ? (
                <Button
                  kind="ghost"
                  disabled={cancelingId === booking.id}
                  aria-label={`${bookingLabel(booking)} 취소`}
                  onClick={() => onCancel(booking)}
                >
                  취소
                </Button>
              ) : (
                <Button kind="ghost" aria-label={`${bookingLabel(booking)} 반려`} onClick={() => onReject(booking)}>
                  반려
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReservationCards() {
  const client = useQueryClient();
  const { me } = useMe();
  const rooms = useRooms();
  // 반려 사유 modal 을 연 예약입니다. null 이면 modal 이 닫혀 있습니다.
  const [rejecting, setRejecting] = useState<Reservation | null>(null);
  const roomIds = (rooms.data?.rooms ?? []).map((room) => room.id);
  // render 중에 현재 시각을 읽으면 render 마다 값이 달라집니다. 화면을 열 때 한 번만 읽어 고정합니다.
  const [openedAt] = useState(() => Date.now());
  const from = dayKey(new Date(openedAt));
  const to = dayKey(new Date(openedAt + WINDOW_DAYS * DAY_MS));

  const list = useUpcomingReservations(roomIds, from, to, rooms.data !== undefined);

  const cancel = useMutation({
    mutationFn: (booking: Reservation) => cancelBooking(booking.id),
    onSettled: () => { void client.invalidateQueries({ queryKey: RESERVATIONS_KEY }); },
    onSuccess: () => say("예약을 취소했어요"),
    onError: (error) => say(reason(error, "예약을 취소하지 못했어요")),
  });

  const bookings = upcomingBookings(list.data?.rows ?? []);
  const failures = list.data?.failures ?? [];
  const state = loadState(list);

  return (
    <Card>
      <SectionHead title="예약" desc={`이후 ${WINDOW_DAYS}일간의 모든 예약 건을 불러왔어요.`} />

      <div className="roster">
        {rooms.isError ? <Empty text={reason(rooms.error)} /> : null}
        {failures.map((text) => <Empty key={text} text={text} />)}
        <ReservationTable
          bookings={bookings}
          meId={me?.id ?? null}
          cancelingId={cancel.isPending ? (cancel.variables?.id ?? null) : null}
          onCancel={(booking) => { if (askCancel(bookingLabel(booking))) cancel.mutate(booking); }}
          onReject={setRejecting}
        />
        {rooms.data !== undefined && (state.kind === "loading" || (state.kind === "ready" && bookings.length === 0)) ? (
          <Empty state={state} text="현재 예약이 존재하지 않아요" />
        ) : null}
      </div>

      {rejecting === null ? null : (
        <RejectDialog
          target="reservation"
          owner={rejecting.member}
          subject={`${dayTimeRangeLabel(rejecting.start, rejecting.end)} ${rejecting.room}`}
          onReject={(text) => rejectBooking(rejecting.id, text)}
          onDone={() => {
            setRejecting(null);
            void client.invalidateQueries({ queryKey: RESERVATIONS_KEY });
            say("예약을 반려했어요");
          }}
          onClose={() => setRejecting(null)}
        />
      )}
    </Card>
  );
}
