---
source: frontend/src/lib/confirm.ts
kind: file
---

# confirm.ts

저장소 경로 `frontend/src/lib/confirm.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_confirm["confirm.ts"]
  frontend_src_components_PostActions["PostActions.tsx"] --> frontend_src_lib_confirm
  frontend_src_components_PostComments["PostComments.tsx"] --> frontend_src_lib_confirm
  frontend_src_lib_confirm_test["confirm.test.ts"] --> frontend_src_lib_confirm
  frontend_src_routes_Assignment["Assignment.tsx"] --> frontend_src_lib_confirm
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_lib_confirm
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_lib_confirm
  frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"] --> frontend_src_lib_confirm
  frontend_src_routes_SettingsReservations["SettingsReservations.tsx"] --> frontend_src_lib_confirm
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"] --> frontend_src_lib_confirm
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_lib_confirm
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_lib_confirm
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/PostActions|PostActions.tsx]]
- [[graph/frontend/src/components/PostComments|PostComments.tsx]]
- [[graph/frontend/src/lib/confirm.test|confirm.test.ts]]
- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/SettingsPeriods|SettingsPeriods.tsx]]
- [[graph/frontend/src/routes/SettingsReservations|SettingsReservations.tsx]]
- [[graph/frontend/src/routes/SettingsRooms|SettingsRooms.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
