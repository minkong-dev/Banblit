---
source: frontend/src/routes/SettingsReservations.tsx
kind: file
---

# SettingsReservations.tsx

저장소 경로 `frontend/src/routes/SettingsReservations.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_SettingsReservations["SettingsReservations.tsx"]
  frontend_src_routes_SettingsReservations --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_SettingsReservations --> frontend_src_components_RejectDialog["RejectDialog.tsx"]
  frontend_src_routes_SettingsReservations --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_SettingsReservations --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_SettingsReservations --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_SettingsReservations --> frontend_src_lib_confirm["confirm.ts"]
  frontend_src_routes_SettingsReservations --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_SettingsReservations --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_SettingsReservations --> frontend_src_lib_toast["toast.ts"]
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_routes_SettingsReservations
```

## imports

- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/RejectDialog|RejectDialog.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/confirm|confirm.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]

## imported by

- [[graph/frontend/src/routes/Settings|Settings.tsx]]
