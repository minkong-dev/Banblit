// 글·댓글 본문을 서식과 함께 작성하는 편집기입니다. 본문을 HTML 문자열로 주고받습니다.
// 저장된 HTML 을 화면에 넣기 전의 sanitize(허용 목록에 없는 태그와 속성을 제거하는 처리)와
// 빈 값 판정은 lib/richText.ts 가 담당합니다.

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Audio } from "@tiptap/extension-audio";
import FileHandler from "@tiptap/extension-file-handler";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { BackgroundColor, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { useEffect, useState } from "react";

import {
  ACCEPTED_MIME, HeadingBackspace, Pdf, Weight, YoutubeTyped, attach,
} from "./richTextEditor";
import { LinkDialog, RichTextToolbar } from "./RichTextToolbar";
import { sanitizeBody, usedColors } from "../lib/richText";

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
    // 문서 내용이 실제로 바뀐 경우만 바깥에 알립니다. 편집기를 만들거나 편집 가능 여부를 바꿀 때도 onUpdate 가
    // 빈 문서("<p></p>")로 불려, 그대로 알리면 글쓰기 화면이 입력한 것으로 판정해 빈 제목 오류를 처음부터 표시합니다.
    onUpdate: ({ editor: changed, transaction }) => { if (transaction.docChanged) onChange(changed.getHTML()); },
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
  // 바깥 값을 넣은 것은 사용자의 입력이 아니므로 onChange 로 되돌려 보내지 않습니다(emitUpdate: false).
  // 되돌려 보내면 빈 값("")이 "<p></p>" 로 돌아와 글쓰기 화면이 입력한 것으로 판정해 빈 제목 오류를 처음부터 표시합니다.
  useEffect(() => {
    if (editor !== null && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false });
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
      <RichTextToolbar editor={editor} used={used} disabled={disabled} postId={postId} onLink={() => setLinking(true)} />
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

/** 저장된 본문을 읽기 전용으로 표시합니다. 남이 작성한 HTML 이므로 넣기 직전에 sanitizeBody 를 거칩니다. */
export function RichTextView({ html }: { html: string }) {
  return <div className="rtview" dangerouslySetInnerHTML={{ __html: sanitizeBody(html) }} />;
}
