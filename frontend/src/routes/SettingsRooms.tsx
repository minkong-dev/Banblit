// 설정 화면의 합주실 구역입니다. 합주실 목록, 추가, 수정, 삭제를 담당합니다.
// 이 동아리는 합주실을 1개만 쓰므로 이미 하나 있으면 추가 버튼이 표시되지 않습니다(사용자 결정). 서버는 개수를 제한하지 않습니다.

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { RefObject } from "react";

import { Card, SectionHead } from "../components/Layout";
import { useReturnFocus } from "../components/hooks";
import { Modal } from "../components/Modal";
import { useRemoveRow, useSlotMinutes } from "../components/queries";
import { askDeleteRoom } from "../lib/confirm";
import type { Room, RoomInput } from "../lib/contract";
import { formError } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { checkRoom, openingHours, removeRoom, saveRoom } from "../lib/pipeline";
import { Button, Cell, Empty, FormFoot, TimeRange } from "../components/controls";
import { Row, useFirstField, useForm } from "./SettingsForm";
import { clockEndLabel } from "../lib/calendar";

// 새 합주실 form 의 초기값입니다. 18:00~23:00 은 동아리 합주실의 실제 운영 시간입니다(사용자 결정).
const BLANK_ROOM: RoomInput = { name: "", opens_at: "18:00", closes_at: "23:00" };

/** 합주실 form 의 입력칸입니다. */
function RoomFields(props: {
  form: RoomInput;
  setForm: (next: RoomInput) => void;
  at: (field: string) => string;
  bad: string;
  whyId: string;
  first: RefObject<HTMLInputElement | null>;
}) {
  const { form, setForm, at, bad, whyId, first } = props;
  return (
    <>
      <Cell label="합주실명" wide htmlFor={at("name")}>
        <input
          ref={first}
          value={form.name}
          id={at("name")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          placeholder="합주실명을 입력해주세요."
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Cell>
      <TimeRange
        id={at("hours")}
        labels={["개방 시간", "마감 시간"]}
        value={[form.opens_at, form.closes_at]}
        // 운영 시간은 칸 크기와 무관하게 정시만 받습니다(서버 rooms 의 CHECK). step 은 초 단위라 3600 이 1시간입니다.
        step={3600}
        invalid={{ "aria-invalid": bad !== "", "aria-describedby": bad === "" ? undefined : whyId }}
        onChange={([opens_at, closes_at]) => setForm({ ...form, opens_at, closes_at })}
      />
    </>
  );
}

export function RoomCard(props: {
  rooms: Room[]; state: LoadState; canEdit: boolean; canCreate: boolean; canDelete: boolean;
  onSaved: () => void; onDeleted: () => void;
}) {
  const { rooms, state, canEdit, canCreate, canDelete, onSaved, onDeleted } = props;
  const slotMinutes = useSlotMinutes();
  const { openId: editing, open, close, register } = useReturnFocus();
  const drop = useRemoveRow(removeRoom, onDeleted);

  return (
    <Card>
      <SectionHead title="합주실" desc="개방 시간과 마감 시간은 정각으로만 설정이 가능해요" />

      {state.kind !== "ready" || rooms.length === 0 ? (
        <Empty as="div" state={state} text="아직 등록된 합주실이 존재하지 않아요" />
      ) : (
        <ul className="rows">
          {rooms.map((room) =>
            canEdit && editing === room.id ? (
              <li className="editing" key={room.id}>
                <RoomForm
                  start={room}
                  // 자신의 이름은 중복 검사 대상에서 제외합니다.
                  taken={rooms.filter((other) => other.id !== room.id).map((other) => other.name)}
                  roomId={room.id}
                  submit="저장"
                  onCancel={close}
                  onDone={() => {
                    close();
                    onSaved();
                  }}
                />
              </li>
            ) : (
              // onEdit 이 없으면 Row 가 수정 버튼을 그리지 않습니다. room_edit 권한이 없는 사람에게는
              // 목록만 표시됩니다.
              <Row
                key={room.id}
                title={room.name}
                when={<><b>{room.opens_at}</b> 부터 <b>{clockEndLabel(room.closes_at)}</b> 까지</>}
                span={` 하루 ${openingHours({ rooms: [room], days: 1, teams: 0, slotMinutes }).perDay}`}
                editLabel={canEdit ? `${room.name} 수정` : undefined}
                buttonRef={canEdit ? register(room.id) : undefined}
                onEdit={canEdit ? () => open(room.id) : undefined}
                deleteLabel={canDelete ? `${room.name} 삭제` : undefined}
                onDelete={canDelete
                  ? () => drop(room.id, askDeleteRoom)
                  : undefined}
              />
            ),
          )}
        </ul>
      )}

      {/* 합주실이 1개 이상이면 추가 버튼을 표시하지 않습니다. */}
      {!canCreate || rooms.length > 0 ? null : <NewRoomButton rooms={rooms} onSaved={onSaved} />}
    </Card>
  );
}

/** "+ 새 합주실" 버튼과 생성 modal 입니다. 저장이 끝나면 modal 을 닫고 onSaved 를 호출합니다. */
function NewRoomButton({ rooms, onSaved }: { rooms: Room[]; onSaved: () => void }) {
  const [making, setMaking] = useState(false);
  return (
    <>
      <div className="listfoot">
        <Button kind="go" onClick={() => setMaking(true)}>+ 새 합주실</Button>
      </div>
      {!making ? null : (
        <Modal title="새 합주실" hint="합주실명과 개방 시간, 마감 시간을 지정해주세요"
          onClose={() => setMaking(false)}>
          <RoomForm
            start={BLANK_ROOM}
            taken={rooms.map((room) => room.name)}
            roomId={null}
            submit="합주실 추가"
            onCancel={() => setMaking(false)}
            onDone={() => { setMaking(false); onSaved(); }}
          />
        </Modal>
      )}
    </>
  );
}

function RoomForm(props: {
  start: RoomInput;
  taken: string[];
  /** 수정하는 합주실의 번호입니다. null 이면 생성입니다. */
  roomId: number | null;
  submit: string;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const { start, taken, roomId, submit, onCancel, onDone } = props;
  const [form, setForm, touched, reset] = useForm(start);
  const first = useFirstField<HTMLInputElement>(onCancel !== undefined);

  const send = useMutation({
    mutationFn: () => saveRoom(roomId, form),
    onSuccess: () => {
      // 새로 생성한 뒤에는 다음 항목을 입력하도록 form 을 초기화합니다. 수정 중이면 그대로 둡니다.
      if (roomId === null) reset();
      onDone();
    },
  });

  const slotMinutes = useSlotMinutes();
  const why = checkRoom(form, taken, slotMinutes);

  // 같은 화면에 추가 form 과 수정 행이 함께 표시될 수 있습니다. label 이 어느 입력칸을 가리키는지
  // 모호해지지 않도록, 화면 내 식별자를 form 마다 다르게 짓습니다.
  const at = (field: string): string => `${roomId === null ? "/rooms" : `/rooms/${roomId}`}-${field}`;
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
        <FormFoot submitLabel={submit} pending={send.isPending} blocked={why !== ""}
            bad={bad} whyId={whyId} onCancel={onCancel} />
      </div>
    </form>
  );
}
