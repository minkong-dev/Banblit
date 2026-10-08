---
source: frontend/src/components/RichTextColor.tsx
kind: file
---

# RichTextColor.tsx

저장소 경로 `frontend/src/components/RichTextColor.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_RichTextColor["RichTextColor.tsx"]
  frontend_src_components_RichTextColor --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_components_RichTextColor --> frontend_src_components_icons["icons.tsx"]
  frontend_src_components_RichTextColor --> frontend_src_components_richTextEditor["richTextEditor.ts"]
  frontend_src_components_RichTextColor --> frontend_src_lib_richText["richText.ts"]
  frontend_src_components_RichTextToolbar["RichTextToolbar.tsx"] --> frontend_src_components_RichTextColor
```

## imports

- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/components/icons|icons.tsx]]
- [[graph/frontend/src/components/richTextEditor|richTextEditor.ts]]
- [[graph/frontend/src/lib/richText|richText.ts]]

## imported by

- [[graph/frontend/src/components/RichTextToolbar|RichTextToolbar.tsx]]
