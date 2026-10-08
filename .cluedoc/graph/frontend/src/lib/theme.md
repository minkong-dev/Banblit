---
source: frontend/src/lib/theme.ts
kind: file
---

# theme.ts

저장소 경로 `frontend/src/lib/theme.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_theme["theme.ts"]
  frontend_src_components_AppShell["AppShell.tsx"] --> frontend_src_lib_theme
  frontend_src_lib_theme_test["theme.test.ts"] --> frontend_src_lib_theme
  frontend_src_main["main.tsx"] --> frontend_src_lib_theme
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/AppShell|AppShell.tsx]]
- [[graph/frontend/src/lib/theme.test|theme.test.ts]]
- [[graph/frontend/src/main|main.tsx]]
