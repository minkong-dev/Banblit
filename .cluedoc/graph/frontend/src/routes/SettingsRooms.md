---
source: frontend/src/routes/SettingsRooms.tsx
kind: file
---

# SettingsRooms.tsx

저장소 경로 `frontend/src/routes/SettingsRooms.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"]
  frontend_src_routes_SettingsRooms --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_SettingsRooms --> frontend_src_components_Modal["Modal.tsx"]
  frontend_src_routes_SettingsRooms --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_SettingsRooms --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_routes_SettingsRooms --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_SettingsRooms --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_SettingsRooms --> frontend_src_lib_confirm["confirm.ts"]
  frontend_src_routes_SettingsRooms --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_SettingsRooms --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_SettingsRooms --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_SettingsRooms --> frontend_src_lib_toast["toast.ts"]
  frontend_src_routes_SettingsRooms --> frontend_src_routes_SettingsForm["SettingsForm.tsx"]
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_routes_SettingsRooms
```

## imports

- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/Modal|Modal.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/confirm|confirm.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]
- [[graph/frontend/src/routes/SettingsForm|SettingsForm.tsx]]

## imported by

- [[graph/frontend/src/routes/Settings|Settings.tsx]]
