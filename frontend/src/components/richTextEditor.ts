// RichText 편집기의 Tiptap 확장 정의와 파일 업로드입니다. 화면(JSX)은 RichText.tsx 가,
// 순수 계산은 lib/richText.ts 가 담당합니다.
//
// Tiptap 은 편집기를 확장(extension)의 묶음으로 구성합니다. node 는 문단·그림처럼 본문을 이루는
// 요소이고, mark 는 굵게·색처럼 글자에 걸치는 서식이며, extension 은 그 둘이 아닌 동작(단축키 등)입니다.

import { Extension, Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import type { useEditor } from "@tiptap/react";
import Youtube from "@tiptap/extension-youtube";
import { TextStyle } from "@tiptap/extension-text-style";

import { apiUrl, reason, sendFile } from "../lib/api";
import { embedKind } from "../lib/richText";
import { say } from "../lib/toast";

/** useEditor 는 편집기를 아직 만들지 못했을 때 null 을 반환합니다. NonNullable 은 그 null 을
 *  제외한 타입이고, 이 타입을 받는 함수와 컴포넌트는 편집기가 있는 상태만 다룹니다. */
export type Editor = NonNullable<ReturnType<typeof useEditor>>;

/** PDF 를 본문에 넣는 노드입니다. Tiptap 에 PDF 확장이 없어 직접 만듭니다 — 유료(Conversion)는
 *  내보내기이고 뷰어가 아닙니다. 뷰어는 브라우저에 내장돼 있어 iframe 하나면 되므로
 *  라이브러리를 더하지 않습니다.
 *  atom: true 는 내부를 편집할 수 없는 하나의 덩어리라는 뜻이고, group: "block" 은 문단과 같은
 *  자리에 놓이는 요소라는 뜻입니다. */
export const Pdf = Node.create({
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
      // 바깥 함수는 호출부가 넘긴 options 를 받고, 안쪽 함수는 Tiptap 이 넘긴 편집기 명령으로
      // 실행합니다. this.name 은 위 name("pdf")이고, addCommands 를 화살표 함수로 선언하지
      // 않아야 this 가 이 확장을 가리킵니다.
      setPdf:
        (options: { src: string; title?: string }) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    };
  },
});

// Tiptap 의 Commands 타입에 setPdf 를 더합니다. 이 선언이 없으면 editor.chain().setPdf(...) 가
// 타입 오류가 됩니다.
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pdf: { setPdf: (options: { src: string; title?: string }) => ReturnType };
  }
}

/** TextStyle 에 굵기(font-weight) 속성을 더합니다. @tiptap/extension-text-style 이 글꼴·크기·색은
 *  제공하지만 굵기는 제공하지 않습니다. Pretendard Variable 의 굵기 축을 쓰려면 100~900 을
 *  값으로 넣을 수 있어야 하고, StarterKit 의 bold 는 굵게 켜고 끄기만 합니다.
 *  this.parent?.() 는 TextStyle 이 원래 정의한 속성이고, 그것을 펼친 뒤 fontWeight 를 더합니다. */
export const Weight = TextStyle.extend({
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
 * priority 를 높여 입력 규칙의 되돌리기보다 먼저 실행합니다. Tiptap 확장의 기본 priority 는
 * 100 이고 1000 은 그보다 먼저 실행된다는 뜻입니다. true 를 반환하면 그쪽은 실행되지 않습니다. */
export const HeadingBackspace = Extension.create({
  name: "headingBackspace",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        // $from 은 선택 구간의 시작 위치입니다. $ 는 문서 구조까지 함께 담은 위치라는 ProseMirror
        // 의 표기입니다. empty 는 선택 구간이 없고 커서만 있는 상태입니다.
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
export const YoutubeTyped = Youtube.extend({
  addInputRules() {
    return [
      nodeInputRule({
        // 줄 시작이나 공백 뒤의 유튜브 주소를 찾습니다. youtube.com/watch?v= 와 youtu.be/ 두
        // 형식을 받고 영상 번호는 11글자입니다. 마지막 \s 가 공백·줄바꿈을 입력한 시점을
        // 가리키므로, 주소를 적는 중에는 변경되지 않습니다.
        find: /(?:^|\s)(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]{11}\S*|youtu\.be\/[\w-]{11}))\s$/,
        type: this.type,
        getAttributes: (match) => ({ src: match[1] }),
      }),
    ];
  },
});
/** 본문에 넣을 수 있는 파일의 MIME(형식을 알리는 문자열)입니다. 나머지는 drop(파일을 끌어다 놓는 동작)해도 처리하지 않고
 *  브라우저 기본 동작(파일 열기)에 맡깁니다. 서버 쪽 허용 목록은 이보다 넓습니다 —
 *  넣지 못하는 형식도 첨부 파일로는 올라갑니다(lib/boards.ts 의 ALLOWED_EXTENSIONS).
 *
 *  이 목록은 붙여넣기·drop·본문용 파일 선택창(RichText.tsx:143·331)이 받을 파일을 거르는 입력 필터입니다.
 *  받은 파일을 본문의 image·audio·pdf 중 무엇으로 넣을지 판정하는 곳은 lib/richText.ts 의 embedKind 이고,
 *  그 IMAGE·AUDIO 집합이 확장자의 기준입니다. 한쪽만 수정하면 선택창에는 표시되는데 본문에 들어가지 않고
 *  첨부로만 올라가므로 두 곳을 함께 수정합니다. audio/x-wav 는 일부 브라우저가 .wav 파일을 이 MIME 으로
 *  보고하므로 넣어 둡니다. */
export const ACCEPTED_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg",
  "application/pdf",
];

/** drop 하거나 붙여넣은 파일을 글에 올리고, 받은 주소를 본문에 넣습니다.
 *  pos 가 있으면 drop 한 자리에, 없으면 커서 자리에 넣습니다. 올리지 못하면 사유만 알리고
 *  본문은 건드리지 않습니다 — 주소 없는 노드를 넣으면 깨진 그림이 남습니다. */
export async function attach(
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
      // chain 은 편집기 명령을 이어 붙이는 방식이고 마지막 run 이 실행합니다. run 을 부르지
      // 않으면 아무것도 적용되지 않습니다.
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
