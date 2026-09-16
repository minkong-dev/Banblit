// 글·댓글 본문을 서식과 함께 작성하는 편집기입니다. 본문을 HTML 문자열로 주고받습니다.
// 저장된 HTML 을 화면에 넣기 전의 sanitize(허용 목록에 없는 태그와 속성을 제거하는 처리)와
// 빈 값 판정은 lib/richText.ts 가 담당합니다.

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { Dropdown } from "./Dropdown";
import { sanitizeBody } from "../lib/richText";

/** 고를 수 있는 글꼴입니다. 값은 CSS 의 font-family 에 그대로 들어갑니다.
 *  빈 값은 지정하지 않은 상태이고, 그때는 화면의 기본 글꼴을 따릅니다. */
const FONTS = [
  { value: "", label: "기본 글꼴" },
  { value: "'Noto Serif KR', serif", label: "명조" },
  { value: "'Nanum Gothic', sans-serif", label: "고딕" },
  { value: "ui-monospace, monospace", label: "고정폭" },
];

type Editor = NonNullable<ReturnType<typeof useEditor>>;

/** 본문을 작성하는 편집기입니다. value 는 HTML 이고, 편집할 때마다 onChange 로 HTML 을 넘깁니다.
 *  id 는 곁에 둔 label 의 htmlFor 가 가리키는 값입니다. */
export function RichText({ id, label, value, onChange, disabled = false, invalid = false, describedBy }: {
  id: string;
  /** 편집 영역의 이름입니다. 편집기는 div 라서 곁의 label 이 for 로 가리켜도 연결되지 않습니다.
   *  label 은 눈으로 보는 용도이고, 화면 읽기 프로그램과 검사는 이 값을 읽습니다. */
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      // 링크는 새 창으로 열되, 연 쪽 창을 조작하지 못하게 rel 을 붙입니다.
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image,
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: changed }) => onChange(changed.getHTML()),
    editorProps: {
      attributes: {
        id,
        class: "rtbody",
        "aria-label": label,
        "aria-invalid": String(invalid),
        ...(describedBy === undefined ? {} : { "aria-describedby": describedBy }),
      },
    },
  });

  // 바깥에서 값을 비우거나 다른 글로 바꿨을 때만 편집기에 다시 넣습니다. 조건 없이 넣으면
  // 글자를 칠 때마다 편집기를 다시 채워 커서가 맨 앞으로 돌아갑니다.
  useEffect(() => {
    if (editor !== null && value !== editor.getHTML()) editor.commands.setContent(value);
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (editor === null) return null;

  return (
    <div className={disabled ? "rt off" : "rt"}>
      <div className="rttools">
        <Mark editor={editor} name="bold" label="굵게"><b>가</b></Mark>
        <Mark editor={editor} name="italic" label="기울임"><i>가</i></Mark>
        <Mark editor={editor} name="strike" label="취소줄"><s>가</s></Mark>
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
        <button type="button" disabled={disabled} onClick={() => askLink(editor)}>링크</button>
        <button type="button" disabled={disabled} onClick={() => askImage(editor)}>그림</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/** 굵게·기울임·취소줄처럼 켜고 끄는 서식 버튼입니다. 지금 켜져 있으면 aria-pressed 로 알립니다. */
function Mark({ editor, name, label, children }: {
  editor: Editor;
  name: "bold" | "italic" | "strike";
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

/** 주소를 물어 고른 글자에 링크를 겁니다. 비운 채 확인하면 링크를 해제합니다. */
function askLink(editor: Editor): void {
  const now = String(editor.getAttributes("link").href ?? "");
  const url = window.prompt("링크 주소를 입력해주세요.", now);
  if (url === null) return;
  if (url.trim() === "") {
    editor.chain().focus().unsetLink().run();
    return;
  }
  // lib/richText.ts 의 sanitizeBody 와 같은 기준입니다. javascript: 같은 주소는 붙이지 않습니다.
  if (!/^(https?:|mailto:|\/)/i.test(url.trim())) {
    window.alert("http 또는 https 로 시작하는 주소를 입력해주세요.");
    return;
  }
  editor.chain().focus().setLink({ href: url.trim() }).run();
}

/** 주소를 물어 그림을 넣습니다. 첨부한 파일의 주소를 붙여 넣는 용도입니다. */
function askImage(editor: Editor): void {
  const url = window.prompt("그림 주소를 입력해주세요.");
  if (url === null || url.trim() === "") return;
  if (!/^(https?:|\/)/i.test(url.trim())) {
    window.alert("http 또는 https 로 시작하는 주소를 입력해주세요.");
    return;
  }
  editor.chain().focus().setImage({ src: url.trim() }).run();
}

/** 저장된 본문을 읽기 전용으로 표시합니다. 남이 작성한 HTML 이므로 넣기 직전에 sanitizeBody 를 거칩니다. */
export function RichTextView({ html }: { html: string }) {
  return <div className="rtview" dangerouslySetInnerHTML={{ __html: sanitizeBody(html) }} />;
}
