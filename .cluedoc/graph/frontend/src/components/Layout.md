---
source: frontend/src/components/Layout.tsx
kind: file
---

# Layout.tsx

저장소 경로 `frontend/src/components/Layout.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_Layout["Layout.tsx"]
  frontend_src_components_Layout_test["Layout.test.tsx"] --> frontend_src_components_Layout
  frontend_src_components_PostBoard["PostBoard.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_Assignment["Assignment.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_AssignmentPanels["AssignmentPanels.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_Board["Board.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_PostWrite["PostWrite.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_ProfileCards["ProfileCards.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_SettingsBlinded["SettingsBlinded.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_SettingsReservations["SettingsReservations.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_components_Layout
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_components_Layout
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/Layout.test|Layout.test.tsx]]
- [[graph/frontend/src/components/PostBoard|PostBoard.tsx]]
- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
- [[graph/frontend/src/routes/AssignmentPanels|AssignmentPanels.tsx]]
- [[graph/frontend/src/routes/Board|Board.tsx]]
- [[graph/frontend/src/routes/PostWrite|PostWrite.tsx]]
- [[graph/frontend/src/routes/ProfileCards|ProfileCards.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/Settings|Settings.tsx]]
- [[graph/frontend/src/routes/SettingsBlinded|SettingsBlinded.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/SettingsPeriods|SettingsPeriods.tsx]]
- [[graph/frontend/src/routes/SettingsReservations|SettingsReservations.tsx]]
- [[graph/frontend/src/routes/SettingsRooms|SettingsRooms.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
