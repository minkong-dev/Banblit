---
source: frontend/src/lib/boards.ts
kind: file
---

# boards.ts

저장소 경로 `frontend/src/lib/boards.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_boards["boards.ts"]
  frontend_src_lib_boards --> frontend_src_lib_richText["richText.ts"]
  frontend_src_components_RichTextToolbar["RichTextToolbar.tsx"] --> frontend_src_lib_boards
  frontend_src_lib_boards_test["boards.test.ts"] --> frontend_src_lib_boards
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_boards
```

## imports

- [[graph/frontend/src/lib/richText|richText.ts]]

## imported by

- [[graph/frontend/src/components/RichTextToolbar|RichTextToolbar.tsx]]
- [[graph/frontend/src/lib/boards.test|boards.test.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
