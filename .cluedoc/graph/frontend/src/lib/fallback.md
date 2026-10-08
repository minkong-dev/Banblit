---
source: frontend/src/lib/fallback.ts
kind: file
---

# fallback.ts

저장소 경로 `frontend/src/lib/fallback.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_fallback["fallback.ts"]
  frontend_src_components_ErrorBoundary["ErrorBoundary.tsx"] --> frontend_src_lib_fallback
  frontend_src_lib_fallback_test["fallback.test.ts"] --> frontend_src_lib_fallback
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/ErrorBoundary|ErrorBoundary.tsx]]
- [[graph/frontend/src/lib/fallback.test|fallback.test.ts]]
