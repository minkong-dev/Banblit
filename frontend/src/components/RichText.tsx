// 글·댓글 본문을 서식과 함께 작성하는 편집기입니다. 본문을 HTML 문자열로 주고받습니다.
// 저장된 HTML 을 화면에 넣기 전의 sanitize(허용 목록에 없는 태그와 속성을 제거하는 처리)와
// 빈 값 판정은 lib/richText.ts 가 담당합니다.

import { Extension, Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Audio } from "@tiptap/extension-audio";
import FileHandler from "@tiptap/extension-file-handler";
import Youtube from "@tiptap/extension-youtube";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { BackgroundColor, Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Dropdown } from "./Dropdown";
import { useDismissible } from "./hooks";
import {
  AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon, BulletListIcon, ClipIcon,
  CodeIcon, EraserIcon, ImageIcon, LinkIcon, NumberListIcon, PaletteIcon, QuoteIcon, RedoIcon,
  RuleIcon, TableIcon, UndoIcon,
} from "./icons";
import { Modal } from "./Modal";
import { ATTACHMENT_ACCEPT } from "../lib/boards";
import { apiUrl, reason, sendFile } from "../lib/api";
import { embedKind, sanitizeBody } from "../lib/richText";
import { say } from "../lib/toast";

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

/** TextStyle 에 굵기(font-weight) 속성을 더합니다. @tiptap/extension-text-style 이 글꼴·크기·색은
 *  제공하지만 굵기는 제공하지 않습니다. Pretendard Variable 의 굵기 축을 쓰려면 100~900 을
 *  값으로 넣을 수 있어야 하고, StarterKit 의 bold 는 굵게 켜고 끄기만 합니다. */
const Weight = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontWeight: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontWeight || null,
        renderHTML: (attributes: { fontWeight?: string | null }) =>
          attributes.fontWeight == null ? {} : { style: `font-weight: ${attributes.fontWeight}` },
      },
    };
  },
});

/** 빈 제목에서 Backspace 를 누르면 보통 문단으로 되돌립니다.
 *
 * TipTap 은 "# " 같은 입력 규칙이 방금 적용된 직후 Backspace 를 누르면 그 규칙을 되돌려
 * 입력했던 "# " 를 본문에 다시 넣습니다. 제목을 만들려다 취소한 사람에게는 지운 글자가
 * 되살아나는 것으로 보이므로, 제목만 삭제하고 글자는 되살리지 않습니다.
 *
 * priority 를 높여 입력 규칙의 되돌리기보다 먼저 실행합니다. true 를 반환하면 그쪽은 실행되지 않습니다. */
const HeadingBackspace = Extension.create({
  name: "headingBackspace",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { empty, $from } = editor.state.selection;
        const inEmptyHeading = empty
          && $from.parent.type.name === "heading"
          && $from.parent.content.size === 0;
        return inEmptyHeading ? editor.commands.setParagraph() : false;
      },
    };
  },
});

/** 유튜브 주소를 타이핑한 뒤 공백이나 줄바꿈을 입력해도 video player 로 변경합니다.
 *  기본 확장은 붙여넣기만 처리해, 주소를 직접 쳐서 넣으면 일반 링크로 남습니다. */
const YoutubeTyped = Youtube.extend({
  addInputRules() {
    return [
      nodeInputRule({
        find: /(?:^|\s)(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]{11}\S*|youtu\.be\/[\w-]{11}))\s$/,
        type: this.type,
        getAttributes: (match) => ({ src: match[1] }),
      }),
    ];
  },
});

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
  editor: Editor, files: File[], pos: number | null, postId: number | null, embed = true,
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
      // 표시용 경로입니다. 다운로드 경로(/attachments/{id})는 모든 파일을 octet-stream 과
      // Content-Disposition: attachment 로 내보내므로 img·audio·iframe 이 표시하지 못합니다.
      const src = apiUrl(`/attachments/${attachment.id}/inline`);
      const at = editor.chain().focus(pos ?? undefined);
      // embed 가 false 면 첨부 목록에만 올립니다(클립 버튼). 본문에 넣지 않습니다.
      const kind = embed ? embedKind(file.name) : "file";
      if (kind === "image") at.setImage({ src, alt: file.name }).run();
      else if (kind === "audio") at.setAudio({ src }).run();
      else if (kind === "pdf") at.setPdf({ src, title: file.name }).run();
      // file 은 본문에 넣지 않습니다. 첨부 목록에는 이미 올라가 있습니다.
      else if (embed) say(`${file.name} 은 본문에 넣을 수 없어 첨부로만 올렸어요.`);
      else say(`${file.name} 을 첨부했어요.`);
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
        // dropcursor 는 파일을 끌어 오는 동안 삽입 위치에 가로 막대를 그립니다. 아래 덧댄 안내(.rtdrop)가
        // 편집기를 전부 가려 그 위치가 보이지 않으므로, 막대만 안내 위에 떠서 정체를 알 수 없는 선이 됩니다.
        dropcursor: false,
        // trailingNode 는 마지막 블록이 문단이 아니면 빈 문단을 덧붙입니다. 제목을 만들면 그 뒤에
        // 빈 줄이 하나 생겨, "# " 를 입력했을 때 커서가 다음 줄로 내려간 것처럼 보입니다.
        // 표·구분선처럼 뒤에 글을 쓸 자리가 없는 블록에서만 필요하므로 문단·제목·목록은 제외합니다.
        trailingNode: { notAfter: ["paragraph", "heading", "bulletList", "orderedList", "blockquote"] },
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      // 글꼴·크기·글자색·배경색은 모두 TextStyle 위에 붙는 표시입니다. 같은 패키지가 제공합니다.
      Weight,
      FontFamily,
      FontSize,
      Color,
      BackgroundColor,
      HeadingBackspace,
      // 문단 정렬은 문단·제목에만 붙입니다. 목록 항목까지 켜면 정렬이 목록 기호와 어긋납니다.
      TextAlign.configure({ types: ["paragraph", "heading"] }),
      // 표입니다. resizable 을 켜면 열 너비를 마우스로 조절할 수 있습니다.
      TableKit.configure({ table: { resizable: true } }),
      Image,
      // 소리는 audio player(<audio controls>)로 넣습니다.
      Audio,
      Pdf,
      // 유튜브 주소를 붙여넣으면 그 자리에서 video player 로 변경됩니다.
      // referrerpolicy 를 iframe 에 직접 지정합니다. 배포는 문서 전체에 Referrer-Policy: same-origin
      // 을 내려(deploy/Caddyfile) 다른 출처로 나가는 요청에 Referer 를 붙이지 않는데, 유튜브는
      // Referer 가 없으면 재생 화면에 "동영상 플레이어 구성 오류"(153)를 표시합니다.
      // 요소에 지정한 정책이 문서 정책보다 우선하므로, 이 iframe 만 출처(경로 제외)를 보냅니다.
      YoutubeTyped.configure({
        nocookie: true,
        width: 640,
        height: 360,
        HTMLAttributes: { referrerpolicy: "strict-origin-when-cross-origin" },
      }),
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
    // postId 를 deps 에 넣습니다. 위 onDrop·onPaste 는 편집기를 만들 때의 postId 를 closure 로 붙잡는데,
    // 글쓰기 화면은 초안 생성이 mount 뒤에 끝나 그 값이 null 로 고정됩니다. 그러면 파일을 drop 해도
    // 올릴 글이 없다고 판정합니다. 초안 번호가 도착하면 편집기를 다시 만들고, 본문은 content 의 value 로
    // 복원됩니다.
  }, [postId]);

  // 바깥에서 값을 초기화하거나 다른 글로 변경했을 때만 편집기에 다시 넣습니다. 조건 없이 넣으면
  // 글자를 칠 때마다 편집기를 다시 채워 커서가 맨 앞으로 돌아갑니다.
  useEffect(() => {
    if (editor !== null && value !== editor.getHTML()) editor.commands.setContent(value);
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // 파일을 창 안으로 끌어 오는 동안에만 안내를 표시합니다. dragenter 와 dragleave 는 자식 요소를 지날 때마다
  // 번갈아 발생하므로 깊이를 세어 0 이 될 때만 내립니다.
  // 네 가지 모두 capture 단계에서 듣습니다 — FileHandler 가 처리한 drop 은 stopPropagation 으로 전파를
  // 멈추므로, bubble 단계에서 들으면 놓은 뒤에도 안내가 그대로 남습니다.
  const [dragging, setDragging] = useState(false);
  // 링크 modal 을 열어 둔 동안만 true 입니다.
  const [linking, setLinking] = useState(false);
  // 색 선택기의 "글에 사용한 색" 목록입니다. 본문이 바뀔 때마다 다시 셉니다.
  const used = usedColors(value);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes("Files") ?? false;
    const enter = (event: DragEvent): void => { if (hasFiles(event)) { depth += 1; setDragging(true); } };
    const leave = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      depth -= 1;
      if (depth <= 0) { depth = 0; setDragging(false); }
    };
    const end = (): void => { depth = 0; setDragging(false); };
    window.addEventListener("dragenter", enter, true);
    window.addEventListener("dragleave", leave, true);
    window.addEventListener("drop", end, true);
    window.addEventListener("dragend", end, true);
    return () => {
      window.removeEventListener("dragenter", enter, true);
      window.removeEventListener("dragleave", leave, true);
      window.removeEventListener("drop", end, true);
      window.removeEventListener("dragend", end, true);
    };
  }, []);

  if (editor === null) return null;

  return (
    <div
      className={disabled ? "rt off" : "rt"}
      // 편집기 밖(도구 줄·여백)에 놓아도 받습니다. dragOver 에서 기본 동작을 막아야 drop 이 발생합니다.
      onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
      // FileHandler 가 처리한 drop 은 여기까지 오지 않습니다. 그것이 잡지 않는 형식만 도달합니다.
      onDrop={(event) => {
        if (disabled) return;
        const dropped = [...event.dataTransfer.files];
        if (dropped.length === 0) return;
        event.preventDefault();
        void attach(editor, dropped, null, postId);
      }}
    >
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

        <Tool editor={editor} label="링크" active={editor.isActive("link")} on={() => setLinking(true)}>
          <LinkIcon />
        </Tool>
        {/* 그림·소리·PDF 는 본문에 들어갑니다. drop 하거나 붙여넣어도 같습니다. */}
        <label className="rtpick" aria-label="그림 넣기">
          <ImageIcon />
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
        {/* 본문에 넣지 않고 첨부 목록에만 올립니다. 형식 제한은 서버의 허용 목록과 같습니다. */}
        <label className="rtpick" aria-label="파일 첨부">
          <ClipIcon />
          <input
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            disabled={disabled}
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])];
              event.target.value = "";
              void attach(editor, picked, null, postId, false);
            }}
          />
        </label>
      </div>
      <EditorContent editor={editor} />
      {!linking ? null : (
        <LinkDialog
          nowText={editor.state.doc.textBetween(
            editor.state.selection.from, editor.state.selection.to, "",
          )}
          nowUrl={String(editor.getAttributes("link").href ?? "")}
          onClose={() => setLinking(false)}
          onSave={(text, url) => {
            setLinking(false);
            const chain = editor.chain().focus();
            if (url === "") { chain.unsetLink().run(); return; }
            const shown = text === "" ? url : text;
            const picked = editor.state.doc.textBetween(
              editor.state.selection.from, editor.state.selection.to, "",
            );
            // 표시할 텍스트를 바꾸지 않았고 선택한 글자가 있으면 그 글자에 링크만 겁니다.
            // 서식(색·크기·굵기)은 그 글자에 이미 붙어 있으므로 그대로 남습니다.
            if (picked !== "" && shown === picked) { chain.setLink({ href: url }).run(); return; }
            // 그 밖에는 표시할 텍스트를 넣고 링크를 겁니다. 선택한 글자가 있으면 그것을 대체합니다.
            chain.insertContent({
              type: "text",
              text: shown,
              marks: [{ type: "link", attrs: { href: url } }],
            }).run();
          }}
        />
      )}
      {dragging ? (
        <div className="rtdrop" aria-hidden="true">
          <b>파일을 여기에 끌어다 놓아주세요</b>
          <span>임베드가 불가능한 형식은 첨부파일로 업로드돼요</span>
        </div>
      ) : null}
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


/** 저장된 본문을 읽기 전용으로 표시합니다. 남이 작성한 HTML 이므로 넣기 직전에 sanitizeBody 를 거칩니다. */
export function RichTextView({ html }: { html: string }) {
  return <div className="rtview" dangerouslySetInnerHTML={{ __html: sanitizeBody(html) }} />;
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
function LinkDialog({ nowText, nowUrl, onClose, onSave }: {
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
        <>
          <button className="btn" type="button" onClick={onClose}>취소</button>
          <button
            className="btn go"
            type="button"
            disabled={bad !== ""}
            onClick={() => onSave(text.trim(), url.trim())}
          >
            저장
          </button>
        </>
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
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Modal>
  );
}

/** 링크 주소를 쓸 수 없는 사유입니다. 쓸 수 있으면 빈 문자열입니다. */
function linkProblem(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "";
  // lib/richText.ts 의 sanitizeBody 와 같은 기준입니다. javascript: 같은 주소는 붙이지 않습니다.
  return /^(https?:|mailto:|\/)/i.test(trimmed) ? "" : "http 또는 https 로 시작하는 주소를 입력해주세요.";
}

/** 팔레트 맨 윗줄의 무채색 8칸입니다. 검정에서 흰색까지입니다. */
const GREYS = ["#000000", "#444444", "#666666", "#999999", "#BBBBBB", "#DDDDDD", "#EEEEEE", "#FFFFFF"];

/** 팔레트의 색 계열 8가지입니다. 빨강부터 자홍까지 색상환을 8등분한 값입니다(HSL 의 hue). */
const HUES = [0, 30, 60, 120, 180, 240, 275, 300];

/** 색 계열마다 만드는 밝기 단계입니다. 위 3줄이 밝은 쪽, 가운데가 원색, 아래 3줄이 어두운 쪽입니다.
 *  [밝기, 채도] 순서이고 단위는 퍼센트입니다. */
const TONES: [number, number][] = [
  [88, 70], [78, 80], [66, 90], [50, 100], [42, 100], [33, 100], [25, 100], [17, 100],
];

/** HSL 값을 "#rrggbb" 로 변환합니다. 팔레트 64칸을 손으로 적지 않고 계산해 만듭니다. */
function hslHex(hue: number, light: number, saturation: number): string {
  const l = light / 100;
  const a = (saturation / 100) * Math.min(l, 1 - l);
  const at = (n: number): string => {
    const k = (n + hue / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${at(0)}${at(8)}${at(4)}`;
}

/** 팔레트에 들어가는 색 전부입니다. 첫 줄이 무채색이고 그 아래 8줄이 색 계열마다의 밝기 단계입니다. */
const PALETTE: string[] = [
  ...GREYS,
  ...TONES.flatMap((tone) => HUES.map((hue) => hslHex(hue, tone[0], tone[1]))),
];

/** 지금 본문에 실제로 쓰인 색입니다. 방금 쓴 색을 다시 고를 때 팔레트를 뒤지지 않아도 됩니다.
 *  color 와 background-color 를 모두 모으고 중복을 제거해 최대 8개까지 반환합니다. */
function usedColors(html: string): string[] {
  const found = html.match(/(?:background-)?color:\s*([^;"']+)/gi) ?? [];
  const values = found.map((one) => one.split(":")[1].trim().toLowerCase());
  return [...new Set(values)].slice(0, 8);
}

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
function ColorPanel({ editor, used, disabled }: {
  editor: Editor;
  used: string[];
  disabled: boolean;
}) {
  const { open, toggle, box } = useDismissible();
  const color = String(editor.getAttributes("textStyle").color ?? "#191f28");
  const background = String(editor.getAttributes("textStyle").backgroundColor ?? "#ffffff");
  return (
    <div className="rtcolor" ref={box}>
      <button type="button" aria-label="글자색과 배경색" aria-expanded={open} disabled={disabled} onClick={toggle}>
        <PaletteIcon />
        <i className="rtcolorbar" style={{ background: color, borderColor: background }} aria-hidden="true" />
      </button>
      {!open ? null : (
        <div className="rtcolorpop" role="dialog" aria-label="글자색과 배경색">
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
      )}
    </div>
  );
}
