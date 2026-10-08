---
source: frontend/src/components/RichTextToolbar.tsx
kind: file
---

# RichTextToolbar.tsx

저장소 경로 `frontend/src/components/RichTextToolbar.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_RichTextToolbar["RichTextToolbar.tsx"]
  frontend_src_components_RichTextToolbar --> frontend_src_components_Dropdown["Dropdown.tsx"]
  frontend_src_components_RichTextToolbar --> frontend_src_components_Modal["Modal.tsx"]
  frontend_src_components_RichTextToolbar --> frontend_src_components_RichTextColor["RichTextColor.tsx"]
  frontend_src_components_RichTextToolbar --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_RichTextToolbar --> frontend_src_components_icons["icons.tsx"]
  frontend_src_components_RichTextToolbar --> frontend_src_components_richTextEditor["richTextEditor.ts"]
  frontend_src_components_RichTextToolbar --> frontend_src_lib_boards["boards.ts"]
  frontend_src_components_RichTextToolbar --> frontend_src_lib_richText["richText.ts"]
  frontend_src_components_RichText["RichText.tsx"] --> frontend_src_components_RichTextToolbar
```

## imports

- [[graph/frontend/src/components/Dropdown|Dropdown.tsx]]
- [[graph/frontend/src/components/Modal|Modal.tsx]]
- [[graph/frontend/src/components/RichTextColor|RichTextColor.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/icons|icons.tsx]]
- [[graph/frontend/src/components/richTextEditor|richTextEditor.ts]]
- [[graph/frontend/src/lib/boards|boards.ts]]
- [[graph/frontend/src/lib/richText|richText.ts]]

## imported by

- [[graph/frontend/src/components/RichText|RichText.tsx]]
