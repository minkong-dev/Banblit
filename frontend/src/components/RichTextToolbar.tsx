// RichText 의 도구 줄(서식 버튼·글꼴 선택·파일 넣기)과 링크 입력 modal 입니다.

import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { FilePicker, FormFoot, IconButton, Why } from "./controls";
import { Dropdown } from "./Dropdown";
import {
  AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon, BulletListIcon, ClipIcon,
  CodeIcon, EraserIcon, ImageIcon, LinkIcon, NumberListIcon, QuoteIcon, RedoIcon,
  RuleIcon, TableIcon, UndoIcon,
} from "./icons";
import { Modal } from "./Modal";
import { ACCEPTED_MIME, attach } from "./richTextEditor";
import type { Editor } from "./richTextEditor";
import { ColorPanel } from "./RichTextColor";
import { ATTACHMENT_ACCEPT } from "../lib/boards";
import { linkProblem } from "../lib/richText";

/** 선택할 수 있는 글꼴입니다. 값은 CSS 의 font-family 에 그대로 들어갑니다.
 *  빈 값은 지정하지 않은 상태이고, 그때는 화면의 기본 글꼴을 따릅니다. */
const FONTS = [
  { value: "", label: "기본 글꼴" },
  // index.html 이 내려받는 글꼴입니다. 나머지는 사용자 기기에 설치된 것을 씁니다.
  { value: "'Pretendard Variable', sans-serif", label: "프리텐다드" },
  { value: "'Noto Serif KR', serif", label: "명조" },
  { value: "'Nanum Gothic', sans-serif", label: "고딕" },
  { value: "ui-monospace, monospace", label: "고정폭" },
];

/** 글자 굵기 선택지입니다. Pretendard Variable 은 굵기 축이 있어 100~900 을 연속으로 표현합니다.
 *  이름은 Pretendard 가 쓰는 표기 그대로입니다 — Thin 100 부터 Black 900 까지입니다.
 *  다른 글꼴은 설치된 굵기 중 가까운 값으로 표시됩니다. 빈 값은 지정하지 않은 상태입니다. */
const WEIGHTS = [
  { value: "", label: "기본 굵기" },
  { value: "100", label: "Thin" },
  { value: "200", label: "ExtraLight" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "SemiBold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "ExtraBold" },
  { value: "900", label: "Black" },
];

/** 문단 종류입니다. 빈 값은 보통 문단이고 1~6 은 제목 단계입니다. */
const LEVELS = [
  { value: "", label: "본문" },
  { value: "1", label: "제목 1" },
  { value: "2", label: "제목 2" },
  { value: "3", label: "제목 3" },
  { value: "4", label: "제목 4" },
  { value: "5", label: "제목 5" },
  { value: "6", label: "제목 6" },
];

/** 글자 크기 선택지입니다. 빈 값은 본문 기본 크기입니다. */
const SIZES = [
  { value: "", label: "기본 크기" },
  { value: "12px", label: "12" },
  { value: "14px", label: "14" },
  { value: "16px", label: "16" },
  { value: "18px", label: "18" },
  { value: "22px", label: "22" },
  { value: "28px", label: "28" },
];

/** 편집기 위의 도구 줄입니다. 링크 버튼을 누르면 onLink 로 알립니다. */
export function RichTextToolbar({ editor, used, disabled, postId, onLink }: {
  editor: Editor;
  used: string[];
  disabled: boolean;
  postId: number | null;
  onLink: () => void;
}) {
  // 숨긴 파일 input 입니다. 도구 줄의 버튼이 click() 으로 엽니다.
  const mediaPick = useRef<HTMLInputElement>(null);
  const filePick = useRef<HTMLInputElement>(null);
  return (
    <div className="rttools">
      <Tool editor={editor} label="실행취소" on={() => editor.chain().focus().undo().run()}><UndoIcon /></Tool>
      <Tool editor={editor} label="다시실행" on={() => editor.chain().focus().redo().run()}><RedoIcon /></Tool>
      <span className="rtbar" aria-hidden="true" />

      <Dropdown
        ariaLabel="글꼴"
        className="rtfont"
        value={String(editor.getAttributes("textStyle").fontFamily ?? "")}
        choices={FONTS.map((font) => ({ value: font.value, label: font.label }))}
        disabled={disabled}
        onChange={(font) => {
          if (font === "") editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(font).run();
        }}
      />
      <Dropdown
        ariaLabel="글자 크기"
        className="rtsize"
        value={String(editor.getAttributes("textStyle").fontSize ?? "")}
        choices={SIZES.map((size) => ({ value: size.value, label: size.label }))}
        disabled={disabled}
        onChange={(size) => {
          if (size === "") editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(size).run();
        }}
      />
      <Dropdown
        ariaLabel="글자 굵기"
        className="rtweight"
        value={String(editor.getAttributes("textStyle").fontWeight ?? "")}
        choices={WEIGHTS.map((one) => ({ value: one.value, label: one.label }))}
        disabled={disabled}
        onChange={(weight) => {
          const chain = editor.chain().focus();
          if (weight === "") chain.setMark("textStyle", { fontWeight: null }).removeEmptyTextStyle().run();
          else chain.setMark("textStyle", { fontWeight: weight }).run();
        }}
      />
      <span className="rtbar" aria-hidden="true" />

      <Mark editor={editor} name="bold" label="굵게"><b>B</b></Mark>
      <Mark editor={editor} name="italic" label="기울임"><i>I</i></Mark>
      <Mark editor={editor} name="underline" label="밑줄"><u>U</u></Mark>
      <Mark editor={editor} name="strike" label="취소줄"><s>S</s></Mark>
      <ColorPanel editor={editor} used={used} disabled={disabled} />
      {/* 글자에 준 표시와 문단 종류를 함께 삭제합니다. 표시만 삭제하면 목록·인용이 남습니다. */}
      <Tool
        editor={editor}
        label="서식 삭제"
        on={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <EraserIcon />
      </Tool>
      <span className="rtbar" aria-hidden="true" />

      <Tool editor={editor} label="왼쪽 정렬" active={editor.isActive({ textAlign: "left" })}
        on={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeftIcon /></Tool>
      <Tool editor={editor} label="가운데 정렬" active={editor.isActive({ textAlign: "center" })}
        on={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenterIcon /></Tool>
      <Tool editor={editor} label="오른쪽 정렬" active={editor.isActive({ textAlign: "right" })}
        on={() => editor.chain().focus().setTextAlign("right").run()}><AlignRightIcon /></Tool>
      <Tool editor={editor} label="양쪽 정렬" active={editor.isActive({ textAlign: "justify" })}
        on={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustifyIcon /></Tool>
      <span className="rtbar" aria-hidden="true" />

      {/* 이름을 "제목" 으로 두면 글 제목 입력칸과 같은 이름이 되어 화면 읽기가 구분하지 못합니다. */}
      <Dropdown
        ariaLabel="문단 종류"
        className="rtlevel"
        value={String(editor.getAttributes("heading").level ?? "")}
        choices={LEVELS.map((one) => ({ value: one.value, label: one.label }))}
        disabled={disabled}
        onChange={(level) => {
          if (level === "") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(level) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        }}
      />
      <Tool editor={editor} label="인용" active={editor.isActive("blockquote")}
        on={() => editor.chain().focus().toggleBlockquote().run()}><QuoteIcon /></Tool>
      <Tool editor={editor} label="코드 블록" active={editor.isActive("codeBlock")}
        on={() => editor.chain().focus().toggleCodeBlock().run()}><CodeIcon /></Tool>
      <Tool editor={editor} label="구분선"
        on={() => editor.chain().focus().setHorizontalRule().run()}><RuleIcon /></Tool>
      <Tool editor={editor} label="글머리 기호" active={editor.isActive("bulletList")}
        on={() => editor.chain().focus().toggleBulletList().run()}><BulletListIcon /></Tool>
      <Tool editor={editor} label="번호 매기기" active={editor.isActive("orderedList")}
        on={() => editor.chain().focus().toggleOrderedList().run()}><NumberListIcon /></Tool>
      {/* 3행 3열로 넣고 첫 줄을 제목 행으로 둡니다. 행·열 추가는 표 안에서 마우스로 합니다. */}
      <Tool editor={editor} label="표 넣기"
        on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon />
      </Tool>
      <span className="rtbar" aria-hidden="true" />

      <Tool editor={editor} label="링크" active={editor.isActive("link")} on={onLink}>
        <LinkIcon />
      </Tool>
      {/* 그림·소리·PDF 는 본문에 들어갑니다. drop 하거나 붙여넣어도 같습니다. */}
      <IconButton label="그림 넣기" className="rtpick" icon={<ImageIcon />} disabled={disabled}
        onClick={() => mediaPick.current?.click()} />
      <FilePicker ref={mediaPick} multiple accept={ACCEPTED_MIME.join(",")} disabled={disabled}
        onFiles={(picked) => void attach(editor, picked, null, postId)} />
      {/* 본문에 넣지 않고 첨부 목록에만 올립니다. 형식 제한은 서버의 허용 목록과 같습니다. */}
      <IconButton label="파일 첨부" className="rtpick" icon={<ClipIcon />} disabled={disabled}
        onClick={() => filePick.current?.click()} />
      <FilePicker ref={filePick} multiple accept={ATTACHMENT_ACCEPT} disabled={disabled}
        onFiles={(picked) => void attach(editor, picked, null, postId, false)} />
    </div>
  );
}

/** 굵게·기울임·취소줄처럼 켜고 끄는 서식 버튼입니다. 지금 켜져 있으면 aria-pressed 로 알립니다. */
function Mark({ editor, name, label, children }: {
  editor: Editor;
  name: "bold" | "italic" | "underline" | "strike";
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={editor.isActive(name)}
      disabled={!editor.isEditable}
      onClick={() => editor.chain().focus().toggleMark(name).run()}
    >
      {children}
    </button>
  );
}

/** 한 번 눌러 실행하거나 켜고 끄는 도구 버튼입니다. active 를 넘기면 켜진 상태를 aria-pressed 로 알립니다. */
function Tool({ editor, label, active, on, children }: {
  editor: Editor;
  label: string;
  active?: boolean;
  on: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      {...(active === undefined ? {} : { "aria-pressed": active })}
      disabled={!editor.isEditable}
      onClick={on}
    >
      {children}
    </button>
  );
}

/** 링크 주소를 받는 modal 입니다. window.prompt 는 브라우저마다 모양이 다르고 이 서비스의
 *  다른 대화 상자와 어긋납니다. 주소를 입력하지 않고 저장하면 링크를 해제합니다. */
export function LinkDialog({ nowText, nowUrl, onClose, onSave }: {
  /** 지금 선택한 글자입니다. 없으면 빈 문자열입니다. */
  nowText: string;
  nowUrl: string;
  onClose: () => void;
  onSave: (text: string, url: string) => void;
}) {
  const [text, setText] = useState(nowText);
  const [url, setUrl] = useState(nowUrl);
  const bad = linkProblem(url);
  return (
    <Modal
      title="링크"
      hint="주소를 입력하지 않고 저장하면 링크를 해제합니다."
      onClose={onClose}
      foot={(
        <FormFoot
          submitLabel="저장"
          pending={false}
          blocked={bad !== ""}
          onCancel={onClose}
          onSubmit={() => onSave(text.trim(), url.trim())}
        />
      )}
    >
      <label className="fld3" htmlFor="rtLinkText">
        표시할 텍스트
        <input
          id="rtLinkText"
          value={text}
          placeholder="표시할 텍스트를 입력해주세요"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className="fld3" htmlFor="rtLinkUrl">
        이동할 링크
        <input
          id="rtLinkUrl"
          value={url}
          placeholder="이동할 링크를 입력해주세요"
          aria-invalid={bad !== ""}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <Why text={bad} />
    </Modal>
  );
}
