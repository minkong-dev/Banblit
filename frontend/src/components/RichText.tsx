// 글·댓글 본문을 서식과 함께 작성하는 편집기입니다. 본문을 HTML 문자열로 주고받습니다.
// 저장된 HTML 을 화면에 넣기 전의 sanitize(허용 목록에 없는 태그와 속성을 제거하는 처리)와
// 빈 값 판정은 lib/richText.ts 가 담당합니다.

import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Audio } from "@tiptap/extension-audio";
import FileHandler from "@tiptap/extension-file-handler";
import Youtube from "@tiptap/extension-youtube";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { Dropdown } from "./Dropdown";
import { apiUrl, reason, sendFile } from "../lib/api";
import { embedKind, sanitizeBody } from "../lib/richText";
import { say } from "../lib/toast";

/** 선택할 수 있는 글꼴입니다. 값은 CSS 의 font-family 에 그대로 들어갑니다.
 *  빈 값은 지정하지 않은 상태이고, 그때는 화면의 기본 글꼴을 따릅니다. */
const FONTS = [
  { value: "", label: "기본 글꼴" },
  { value: "'Noto Serif KR', serif", label: "명조" },
  { value: "'Nanum Gothic', sans-serif", label: "고딕" },
  { value: "ui-monospace, monospace", label: "고정폭" },
];

/** PDF 를 본문에 넣는 노드입니다. Tiptap 에 PDF 확장이 없어 직접 만듭니다 — 유료(Conversion)는
 *  내보내기이고 뷰어가 아닙니다. 뷰어는 브라우저에 내장돼 있어 iframe 하나면 되므로
 *  라이브러리를 더하지 않습니다. */
const Pdf = Node.create({
  name: "pdf",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null }, title: { default: null } };
  },
  parseHTML() {
    return [{ tag: "iframe[data-pdf]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["iframe", mergeAttributes(HTMLAttributes, { "data-pdf": "", class: "rtpdf" })];
  },
  addCommands() {
    return {
      setPdf:
        (options: { src: string; title?: string }) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pdf: { setPdf: (options: { src: string; title?: string }) => ReturnType };
  }
}

type Editor = NonNullable<ReturnType<typeof useEditor>>;

/** 본문에 넣을 수 있는 파일의 MIME(형식을 알리는 문자열)입니다. 나머지는 drop(파일을 끌어다 놓는 동작)해도 처리하지 않고
 *  브라우저 기본 동작(파일 열기)에 맡깁니다. 서버 쪽 허용 목록은 이보다 넓습니다 —
 *  넣지 못하는 형식도 첨부 파일로는 올라갑니다(lib/boards.ts 의 ALLOWED_EXTENSIONS). */
const ACCEPTED_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg",
  "application/pdf",
];

/** drop 하거나 붙여넣은 파일을 글에 올리고, 받은 주소를 본문에 넣습니다.
 *  pos 가 있으면 drop 한 자리에, 없으면 커서 자리에 넣습니다. 올리지 못하면 사유만 알리고
 *  본문은 건드리지 않습니다 — 주소 없는 노드를 넣으면 깨진 그림이 남습니다. */
async function attach(
  editor: Editor, files: File[], pos: number | null, postId: number | null,
): Promise<void> {
  if (postId === null) {
    say("글을 준비하는 중이에요. 잠시 후 다시 넣어주세요.");
    return;
  }
  for (const file of files) {
    try {
      const { attachment } = await sendFile<{ attachment: { id: number } }>(
        `/posts/${postId}/attachments`, file, () => undefined,
      );
      const src = apiUrl(`/attachments/${attachment.id}`);
      const at = editor.chain().focus(pos ?? undefined);
      const kind = embedKind(file.name);
      if (kind === "image") at.setImage({ src, alt: file.name }).run();
      else if (kind === "audio") at.setAudio({ src }).run();
      else if (kind === "pdf") at.setPdf({ src, title: file.name }).run();
      // file 은 본문에 넣지 않습니다. 첨부 목록에는 이미 올라가 있습니다.
      else say(`${file.name} 은 본문에 넣을 수 없어 첨부로만 올렸어요.`);
    } catch (error) {
      say(`${file.name} 을 올리지 못했어요 — ${reason(error)}`);
    }
  }
}

/** 본문을 작성하는 편집기입니다. value 는 HTML 이고, 편집할 때마다 onChange 로 HTML 을 넘깁니다.
 *  id 는 곁에 둔 label 의 htmlFor 가 가리키는 값입니다. */
export function RichText({ id, label, postId, value, onChange, disabled = false, invalid = false, describedBy }: {
  id: string;
  /** 본문에 넣을 파일을 올릴 글의 번호입니다. 초안이어도 됩니다. null 이면 drop 해도 올리지 않습니다
   *  — 올릴 곳이 없습니다(첨부 업로드가 POST /posts/{id}/attachments 입니다). */
  postId: number | null;
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
      // StarterKit 이 Link 를 이미 담고 있습니다. 따로 등록하면 같은 이름이 둘이 되어 하나가
      // 무시되므로, 설정을 StarterKit 안으로 넘깁니다.
      // 링크는 새 창으로 열되, 연 쪽 창을 조작하지 못하게 rel 을 붙입니다.
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TextStyle,
      FontFamily,
      Image,
      // 소리는 audio player(<audio controls>)로 넣습니다.
      Audio,
      Pdf,
      // 유튜브 주소를 붙여넣으면 그 자리에서 video player 로 변경됩니다.
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      // 본문에 파일을 drop 하거나 붙여넣으면 잡아서 올립니다. 그리는 것은 이 확장이 하지 않고,
      // 아래 attach 가 형식에 따라 노드를 넣습니다.
      FileHandler.configure({
        allowedMimeTypes: ACCEPTED_MIME,
        onDrop: (current, dropped, pos) => void attach(current, dropped, pos, postId),
        onPaste: (current, pasted) => void attach(current, pasted, null, postId),
      }),
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

  // 바깥에서 값을 초기화하거나 다른 글로 변경했을 때만 편집기에 다시 넣습니다. 조건 없이 넣으면
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
        {/* 파일은 본문에 drop 하거나 붙여넣어도 됩니다. 이 버튼은 그 두 방법을 모르는 사람을 위한
            같은 동작의 입구입니다. */}
        <label className="rtpick">
          파일
          <input
            type="file"
            multiple
            accept={ACCEPTED_MIME.join(",")}
            disabled={disabled}
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])];
              event.target.value = "";
              void attach(editor, picked, null, postId);
            }}
          />
        </label>
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

/** 주소를 물어 선택한 글자에 링크를 겁니다. 주소를 입력하지 않고 확인하면 링크를 해제합니다. */
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

/** 저장된 본문을 읽기 전용으로 표시합니다. 남이 작성한 HTML 이므로 넣기 직전에 sanitizeBody 를 거칩니다. */
export function RichTextView({ html }: { html: string }) {
  return <div className="rtview" dangerouslySetInnerHTML={{ __html: sanitizeBody(html) }} />;
}
