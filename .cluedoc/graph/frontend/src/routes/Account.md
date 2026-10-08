---
source: frontend/src/routes/Account.tsx
kind: file
---

# Account.tsx

저장소 경로 `frontend/src/routes/Account.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_Account["Account.tsx"]
  frontend_src_routes_Account --> frontend_src_components_Brand["Brand.tsx"]
  frontend_src_routes_Account --> frontend_src_components_Field["Field.tsx"]
  frontend_src_routes_Account --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_Account --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_routes_Account --> frontend_src_components_icons["icons.tsx"]
  frontend_src_routes_Account --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_Account --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_Account --> frontend_src_lib_toast["toast.ts"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_Account
```

## imports

- [[graph/frontend/src/components/Brand|Brand.tsx]]
- [[graph/frontend/src/components/Field|Field.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/components/icons|icons.tsx]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
