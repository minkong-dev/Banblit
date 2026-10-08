---
source: frontend/src/components/ErrorBoundary.tsx
kind: file
---

# ErrorBoundary.tsx

저장소 경로 `frontend/src/components/ErrorBoundary.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_ErrorBoundary["ErrorBoundary.tsx"]
  frontend_src_components_ErrorBoundary --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_ErrorBoundary --> frontend_src_lib_fallback["fallback.ts"]
  frontend_src_main["main.tsx"] --> frontend_src_components_ErrorBoundary
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/lib/fallback|fallback.ts]]

## imported by

- [[graph/frontend/src/main|main.tsx]]
