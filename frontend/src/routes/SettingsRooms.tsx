// 설정 화면의 합주실 구역입니다. 합주실 목록·추가·수정·삭제를 담당합니다.
// 합주실은 하나만 사용하므로 이미 하나 있으면 추가 버튼이 표시되지 않습니다. 자세한 이유는 RoomCard 안의 주석에 있습니다.

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { RefObject } from "react";

import { Card } from "../components/AppShell";
import { Modal } from "../components/Modal";
import { useSlotMinutes } from "../components/queries";
import { getJSON, reason } from "../lib/api";
import { askDeleteRoom } from "../lib/confirm";
import type { Room } from "../lib/contract";
import { formError } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { checkRoom, openingHours } from "../lib/pipeline";
import { say } from "../lib/toast";
import {
  Cell,
  CardState,
  FormTail,
  Row,
  useFirstField,
  useForm,
  SectionHead,
  useRowFocus,
} from "./SettingsForm";

const BLANK_ROOM = { name: "", opens_at: "18:00", closes_at: "23:00" };

/** 합주실 form 의 입력칸입니다. */
function RoomFields(props: {
  form: { name: string; opens_at: string; closes_at: string };
  setForm: (next: { name: string; opens_at: string; closes_at: string }) => void;
  at: (field: string) => string;
  bad: string;
  whyId: string;
  first: RefObject<HTMLInputElement | null>;
}) {
  const { form, setForm, at, bad, whyId, first } = props;
  return (
    <>
      <Cell label="이름" wide htmlFor={at("name")}>
        <input
          ref={first}
          value={form.name}
          id={at("name")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          placeholder="합주실"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Cell>
      <Cell label="개방 시간" htmlFor={at("opens")}>
        <input
          type="time"
          step={3600}
          value={form.opens_at}
          id={at("opens")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          onChange={(event) => setForm({ ...form, opens_at: event.target.value })}
        />
      </Cell>
      <Cell label="마감 시간" htmlFor={at("closes")}>
        <input
          type="time"
          step={3600}
          value={form.closes_at}
          id={at("closes")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          onChange={(event) => setForm({ ...form, closes_at: event.target.value })}
        />
      </Cell>
    </>
  );
}

export function RoomCard(props: {
  rooms: Room[]; state: LoadState; canEdit: boolean; canCreate: boolean; canDelete: boolean;
  onSaved: () => void; onDeleted: () => void;
}) {
  const { rooms, state, canEdit, canCreate, canDelete, onSaved, onDeleted } = props;
  const slotMinutes = useSlotMinutes();
  const { editing, open, close, register } = useRowFocus();
  const [making, setMaking] = useState(false);
  // 합주실을 삭제하면 서버가 그 합주실의 예약·배정 결과·이전 배정기록을 함께 삭제합니다(외래 키 CASCADE).
  const drop = useMutation({
    mutationFn: (id: number) => getJSON(`/rooms/${id}`, { method: "DELETE" }),
    onSuccess: onDeleted,
    onError: (error) => say(reason(error)),
  });

  return (
    <Card>
      <SectionHead title="합주실" desc="개방 및 마감시간은 정각으로만 설정이 가능해요" />

      {state.kind !== "ready" || rooms.length === 0 ? (
        <CardState state={state} empty="아직 등록된 합주실이 없어요" />
      ) : (
        <ul className="rows">
          {rooms.map((room) =>
            canEdit && editing === room.id ? (
              <li className="editing" key={room.id}>
                <RoomForm
                  start={room}
                  // 자신의 이름은 중복 검사 대상에서 제외합니다.
                  taken={rooms.filter((other) => other.id !== room.id).map((other) => other.name)}
                  path={`/rooms/${room.id}`}
                  method="PATCH"
                  submit="저장"
                  onCancel={close}
                  onDone={() => {
                    close();
                    onSaved();
                  }}
                />
              </li>
            ) : (
              // onEdit이 없으면 Row가 수정 버튼을 그리지 않습니다. room_edit 권한이 없는 사람에게는
              // 목록만 표시됩니다.
              <Row
                key={room.id}
                title={room.name}
                when={<><b>{room.opens_at}</b> 부터 <b>{room.closes_at}</b> 까지</>}
                span={` · 하루 ${openingHours({ rooms: [room], days: 1, teams: 0, slotMinutes }).perDay}`}
                editLabel={canEdit ? `${room.name} 수정` : undefined}
                buttonRef={canEdit ? register(room.id) : undefined}
                onEdit={canEdit ? () => open(room.id) : undefined}
                deleteLabel={canDelete ? `${room.name} 삭제` : undefined}
                // 삭제 요청이 진행 중이면 다시 누른 것을 무시합니다. 연속으로 누르면 같은 DELETE 가 여러 번 전송됩니다.
                onDelete={canDelete
                  ? () => {
                    if (drop.isPending) return;
                    if (askDeleteRoom()) drop.mutate(room.id);
                  }
                  : undefined}
              />
            ),
          )}
        </ul>
      )}

      {/* 합주실은 하나만 사용합니다. 이미 하나 있으면 추가 form 을 표시하지 않습니다.
          저장소와 배정 계산은 합주실 2개 이상을 다룰 수 있게 그대로 두고, 추가 경로만 차단했습니다.
          여러 합주실을 다시 쓸 일이 생기면 이 조건 하나를 제거하면 됩니다. */}
      {!canCreate || rooms.length > 0 ? null : (
        <div className="listfoot">
          <button className="new" onClick={() => setMaking(true)}>+ 새 합주실</button>
        </div>
      )}

      {!making ? null : (
        <Modal title="새 합주실" hint="합주실 이름과 개방 및 마감시간을 지정해주세요"
          onClose={() => setMaking(false)}>
          <RoomForm
            start={BLANK_ROOM}
            taken={rooms.map((room) => room.name)}
            path="/rooms"
            method="POST"
            submit="합주실 추가"
            onCancel={() => setMaking(false)}
            onDone={() => { setMaking(false); onSaved(); }}
          />
        </Modal>
      )}
    </Card>
  );
}

function RoomForm(props: {
  start: { name: string; opens_at: string; closes_at: string };
  taken: string[];
  path: string;
  method: "POST" | "PATCH";
  submit: string;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const { start, taken, path, method, submit, onCancel, onDone } = props;
  const [form, setForm, touched, reset] = useForm(start);
  const first = useFirstField<HTMLInputElement>(onCancel !== undefined);

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ room: Room }>(path, {
        method,
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      // 새로 생성한 뒤에는 다음 항목을 입력하도록 form 을 초기화합니다. 수정 중이면 그대로 둡니다.
      if (method === "POST") reset();
      onDone();
    },
  });

  const slotMinutes = useSlotMinutes();
  const why = checkRoom(form, taken, slotMinutes);

  // 같은 화면에 추가 form 과 수정 행이 함께 표시될 수 있습니다. label 이 어느 입력칸을 가리키는지
  // 모호해지지 않도록, 화면 내 식별자를 form 마다 다르게 짓습니다.
  const at = (field: string): string => `${path}-${field}`;
  const whyId = at("why");
  const bad = formError(touched, why, send.error);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (why === "") send.mutate();
      }}
    >
      <div className="fields">
        <RoomFields form={form} setForm={setForm} at={at} bad={bad} whyId={whyId} first={first} />
        <FormTail submit={submit} pending={send.isPending} blocked={why !== ""}
            bad={bad} whyId={whyId} onCancel={onCancel} />
      </div>
    </form>
  );
}
