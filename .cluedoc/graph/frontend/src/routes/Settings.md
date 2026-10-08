---
source: frontend/src/routes/Settings.tsx
kind: file
---

# Settings.tsx

저장소 경로 `frontend/src/routes/Settings.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_Settings["Settings.tsx"]
  frontend_src_routes_Settings --> frontend_src_components_Dropdown["Dropdown.tsx"]
  frontend_src_routes_Settings --> frontend_src_components_Layout["Layout.tsx"]
  frontend_src_routes_Settings --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_Settings --> frontend_src_components_queries["queries.ts"]
  frontend_src_routes_Settings --> frontend_src_lib_account["account.ts"]
  frontend_src_routes_Settings --> frontend_src_lib_adminMenu["adminMenu.ts"]
  frontend_src_routes_Settings --> frontend_src_lib_api["api.ts"]
  frontend_src_routes_Settings --> frontend_src_lib_contract["contract.ts"]
  frontend_src_routes_Settings --> frontend_src_lib_loading["loading.ts"]
  frontend_src_routes_Settings --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_routes_Settings --> frontend_src_lib_settings["settings.ts"]
  frontend_src_routes_Settings --> frontend_src_lib_toast["toast.ts"]
  frontend_src_routes_Settings --> frontend_src_routes_SettingsBlinded["SettingsBlinded.tsx"]
  frontend_src_routes_Settings --> frontend_src_routes_SettingsMembers["SettingsMembers.tsx"]
  frontend_src_routes_Settings --> frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"]
  frontend_src_routes_Settings --> frontend_src_routes_SettingsReservations["SettingsReservations.tsx"]
  frontend_src_routes_Settings --> frontend_src_routes_SettingsRooms["SettingsRooms.tsx"]
  frontend_src_routes_Settings --> frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_Settings
```

## imports

- [[graph/frontend/src/components/Dropdown|Dropdown.tsx]]
- [[graph/frontend/src/components/Layout|Layout.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/account|account.ts]]
- [[graph/frontend/src/lib/adminMenu|adminMenu.ts]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/settings|settings.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]
- [[graph/frontend/src/routes/SettingsBlinded|SettingsBlinded.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/SettingsPeriods|SettingsPeriods.tsx]]
- [[graph/frontend/src/routes/SettingsReservations|SettingsReservations.tsx]]
- [[graph/frontend/src/routes/SettingsRooms|SettingsRooms.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
