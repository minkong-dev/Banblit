// RichText 도구 줄의 색 선택 부분입니다. 글자색과 배경색을 popover 하나에서 고릅니다.
// 팔레트 값과 최근 사용한 색 계산은 lib/richText.ts 가 담당합니다.

import { useId, useRef, useState } from "react";

import { usePopoverRouteClose } from "./hooks";
import { PaletteIcon } from "./icons";
import type { Editor } from "./richTextEditor";
import { PALETTE } from "../lib/richText";

/** 색 한 칸입니다. 글자색과 배경색이 같은 모양을 씁니다. */
function ColorColumn({ title, reset, resetLabel, value, used, onPick }: {
  title: string;
  /** 위쪽 버튼을 눌렀을 때의 동작입니다. 글자색은 기본값으로, 배경색은 투명으로 되돌립니다. */
  reset: () => void;
  resetLabel: string;
  value: string;
  used: string[];
  onPick: (color: string) => void;
}) {
  // 브라우저 색 선택기를 여는 입력칸입니다. 그 선택기 안에 스펙트럼과 HEX 입력이 이미 들어 있어
  // 따로 만들지 않습니다. 화면에는 보이지 않고 버튼이 눌러 줍니다.
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="rtcol">
      <p className="cap2">{title}</p>
      <button type="button" className="rtreset" onClick={reset}>{resetLabel}</button>
      <div className="rtgrid" role="group" aria-label={`${title} 팔레트`}>
        {PALETTE.map((color) => (
          <button
            type="button"
            key={color}
            aria-label={color}
            style={{ background: color }}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
      {/* 누르면 브라우저 색 선택기가 바로 열립니다. 그 안에 스펙트럼과 HEX 입력이 들어 있어
          이 화면에서 따로 만들지 않습니다. */}
      <button type="button" className="rtreset" onClick={() => picker.current?.click()}>
        직접 선택
      </button>
      <input
        ref={picker}
        className="rthidden"
        type="color"
        tabIndex={-1}
        aria-label={`${title} 직접 선택`}
        value={value}
        onChange={(event) => onPick(event.target.value)}
      />
      {/* 최근 사용한 색입니다. 본문에 이미 쓴 색을 다시 고를 때 팔레트를 뒤지지 않아도 됩니다. */}
      <p className="cap2">최근 사용한 색</p>
      <div className="rtgrid recent" role="group" aria-label={`${title} 최근 사용한 색`}>
        {Array.from({ length: 8 }, (_, index) => used[index] ?? null).map((color, index) => (
          color === null
            ? <span key={`empty-${index}`} className="none" />
            : <button
              type="button"
              key={color}
              aria-label={`${title} ${color}`}
              style={{ background: color }}
              onClick={() => onPick(color)}
            />
        ))}
      </div>
    </div>
  );
}

/** 글자색과 배경색을 popover(버튼에 붙어 열리는 작은 창) 하나에서 고릅니다. 팔레트·초기화·스펙트럼·최근 사용한 색이 모두 들어 있습니다. */
export function ColorPanel({ editor, used, disabled }: {
  editor: Editor;
  used: string[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  usePopoverRouteClose(popId);
  const color = String(editor.getAttributes("textStyle").color ?? "#191f28");
  const background = String(editor.getAttributes("textStyle").backgroundColor ?? "#ffffff");
  return (
    <div className="rtcolor">
      <button type="button" aria-label="글자색과 배경색" aria-expanded={open} disabled={disabled} popoverTarget={popId}>
        <PaletteIcon />
        <i className="rtcolorbar" style={{ background: color, borderColor: background }} aria-hidden="true" />
      </button>
      <div
        id={popId}
        popover="auto"
        className="rtcolorpop"
        role="dialog"
        aria-label="글자색과 배경색"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <ColorColumn
          title="글자색"
          resetLabel="기본값으로 설정"
          reset={() => editor.chain().focus().unsetColor().run()}
          value={color}
          used={used}
          onPick={(next) => editor.chain().focus().setColor(next).run()}
        />
        <ColorColumn
          title="배경색"
          resetLabel="투명"
          reset={() => editor.chain().focus().unsetBackgroundColor().run()}
          value={background}
          used={used}
          onPick={(next) => editor.chain().focus().setBackgroundColor(next).run()}
        />
      </div>
    </div>
  );
}
