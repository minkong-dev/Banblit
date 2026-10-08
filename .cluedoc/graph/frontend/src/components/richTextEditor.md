---
source: frontend/src/components/richTextEditor.ts
kind: file
---

# richTextEditor.ts

저장소 경로 `frontend/src/components/richTextEditor.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_richTextEditor["richTextEditor.ts"]
  frontend_src_components_richTextEditor --> frontend_src_lib_api["api.ts"]
  frontend_src_components_richTextEditor --> frontend_src_lib_richText["richText.ts"]
  frontend_src_components_richTextEditor --> frontend_src_lib_toast["toast.ts"]
  frontend_src_components_RichText["RichText.tsx"] --> frontend_src_components_richTextEditor
  frontend_src_components_RichTextColor["RichTextColor.tsx"] --> frontend_src_components_richTextEditor
  frontend_src_components_RichTextToolbar["RichTextToolbar.tsx"] --> frontend_src_components_richTextEditor
```

## imports

- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/richText|richText.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]

## imported by

- [[graph/frontend/src/components/RichText|RichText.tsx]]
- [[graph/frontend/src/components/RichTextColor|RichTextColor.tsx]]
- [[graph/frontend/src/components/RichTextToolbar|RichTextToolbar.tsx]]
