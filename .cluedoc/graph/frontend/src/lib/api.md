---
source: frontend/src/lib/api.ts
kind: file
---

# api.ts

저장소 경로 `frontend/src/lib/api.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_api["api.ts"]
  frontend_src_components_Avatar["Avatar.tsx"] --> frontend_src_lib_api
  frontend_src_components_MemberSearch["MemberSearch.tsx"] --> frontend_src_lib_api
  frontend_src_components_PostActions["PostActions.tsx"] --> frontend_src_lib_api
  frontend_src_components_PostAttachments["PostAttachments.tsx"] --> frontend_src_lib_api
  frontend_src_components_PostComments["PostComments.tsx"] --> frontend_src_lib_api
  frontend_src_components_PostWriteForm["PostWriteForm.tsx"] --> frontend_src_lib_api
  frontend_src_components_richTextEditor["richTextEditor.ts"] --> frontend_src_lib_api
  frontend_src_lib_api_test["api.test.ts"] --> frontend_src_lib_api
  frontend_src_lib_loading["loading.ts"] --> frontend_src_lib_api
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_api
  frontend_src_routes_Account["Account.tsx"] --> frontend_src_lib_api
  frontend_src_routes_Assignment["Assignment.tsx"] --> frontend_src_lib_api
  frontend_src_routes_AssignmentPanels["AssignmentPanels.tsx"] --> frontend_src_lib_api
  frontend_src_routes_Profile["Profile.tsx"] --> frontend_src_lib_api
  frontend_src_routes_ProfileCards["ProfileCards.tsx"] --> frontend_src_lib_api
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_lib_api
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_lib_api
  frontend_src_routes_SettingsBlinded["SettingsBlinded.tsx"] --> frontend_src_lib_api
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_lib_api
  frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"] --> frontend_src_lib_api
  frontend_src_routes_SettingsReservations["SettingsReservations.tsx"] --> frontend_src_lib_api
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"] --> frontend_src_lib_api
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_lib_api
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_lib_api
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/Avatar|Avatar.tsx]]
- [[graph/frontend/src/components/MemberSearch|MemberSearch.tsx]]
- [[graph/frontend/src/components/PostActions|PostActions.tsx]]
- [[graph/frontend/src/components/PostAttachments|PostAttachments.tsx]]
- [[graph/frontend/src/components/PostComments|PostComments.tsx]]
- [[graph/frontend/src/components/PostWriteForm|PostWriteForm.tsx]]
- [[graph/frontend/src/components/richTextEditor|richTextEditor.ts]]
- [[graph/frontend/src/lib/api.test|api.test.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/routes/Account|Account.tsx]]
- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
- [[graph/frontend/src/routes/AssignmentPanels|AssignmentPanels.tsx]]
- [[graph/frontend/src/routes/Profile|Profile.tsx]]
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
