---
source: frontend/src/routes/ProfileCards.tsx
kind: file
---

# ProfileCards.tsx

저장소 경로 `frontend/src/routes/ProfileCards.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_ProfileCards["ProfileCards.tsx"]
  frontend_src_routes_ProfileCards --> frontend_src_components_Avatar["Avatar.tsx"]
  frontend_src_routes_ProfileCards --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_ProfileCards --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_ProfileCards --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_routes_ProfileCards --> frontend_src_lib_account["account.ts"]
  frontend_src_routes_ProfileCards --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_ProfileCards --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_ProfileCards --> frontend_src_lib_toast["toast.ts"]
  frontend_src_routes_ProfileCards --> frontend_src_lib_validate["validate.ts"]
  frontend_src_routes_Profile["Profile.tsx"] --> frontend_src_routes_ProfileCards
```

## imports

- [[graph/frontend/src/components/Avatar|Avatar.tsx]]
- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/lib/account|account.ts]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]
- [[graph/frontend/src/lib/validate|validate.ts]]

## imported by

- [[graph/frontend/src/routes/Profile|Profile.tsx]]
