---
source: frontend/src/components/RejectDialog.tsx
kind: file
---

# RejectDialog.tsx

저장소 경로 `frontend/src/components/RejectDialog.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_RejectDialog["RejectDialog.tsx"]
  frontend_src_components_RejectDialog --> frontend_src_components_Modal["Modal.tsx"]
  frontend_src_components_RejectDialog --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_RejectDialog --> frontend_src_lib_contract["contract.ts"]
  frontend_src_components_RejectDialog --> frontend_src_lib_loading["loading.ts"]
  frontend_src_components_RejectDialog --> frontend_src_lib_notifications["notifications.ts"]
  frontend_src_routes_SettingsReservations["SettingsReservations.tsx"] --> frontend_src_components_RejectDialog
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_components_RejectDialog
```

## imports

- [[graph/frontend/src/components/Modal|Modal.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/notifications|notifications.ts]]

## imported by

- [[graph/frontend/src/routes/SettingsReservations|SettingsReservations.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
