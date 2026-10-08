---
source: frontend/src/lib/richText.ts
kind: file
---

# richText.ts

저장소 경로 `frontend/src/lib/richText.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_richText["richText.ts"]
  frontend_src_components_RichText["RichText.tsx"] --> frontend_src_lib_richText
  frontend_src_components_RichTextColor["RichTextColor.tsx"] --> frontend_src_lib_richText
  frontend_src_components_RichTextToolbar["RichTextToolbar.tsx"] --> frontend_src_lib_richText
  frontend_src_components_richTextEditor["richTextEditor.ts"] --> frontend_src_lib_richText
  frontend_src_lib_boards["boards.ts"] --> frontend_src_lib_richText
  frontend_src_lib_richText_test["richText.test.ts"] --> frontend_src_lib_richText
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/RichText|RichText.tsx]]
- [[graph/frontend/src/components/RichTextColor|RichTextColor.tsx]]
- [[graph/frontend/src/components/RichTextToolbar|RichTextToolbar.tsx]]
- [[graph/frontend/src/components/richTextEditor|richTextEditor.ts]]
- [[graph/frontend/src/lib/boards|boards.ts]]
- [[graph/frontend/src/lib/richText.test|richText.test.ts]]
