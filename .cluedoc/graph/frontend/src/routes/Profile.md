---
source: frontend/src/routes/Profile.tsx
kind: file
---

# Profile.tsx

저장소 경로 `frontend/src/routes/Profile.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_Profile["Profile.tsx"]
  frontend_src_routes_Profile --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_Profile --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_Profile --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_Profile --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_Profile --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_Profile --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_Profile --> frontend_src_lib_roster["roster.ts"]
  frontend_src_routes_Profile --> frontend_src_routes_ProfileCards["ProfileCards.tsx"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_Profile
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/routes/ProfileCards|ProfileCards.tsx]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
