---
source: frontend/src/lib/toast.ts
kind: file
---

# toast.ts

저장소 경로 `frontend/src/lib/toast.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_toast["toast.ts"]
  frontend_src_components_AppShell["AppShell.tsx"] --> frontend_src_lib_toast
  frontend_src_components_PostActions["PostActions.tsx"] --> frontend_src_lib_toast
  frontend_src_components_PostAttachments["PostAttachments.tsx"] --> frontend_src_lib_toast
  frontend_src_components_PostComments["PostComments.tsx"] --> frontend_src_lib_toast
  frontend_src_components_PostWriteForm["PostWriteForm.tsx"] --> frontend_src_lib_toast
  frontend_src_components_richTextEditor["richTextEditor.ts"] --> frontend_src_lib_toast
  frontend_src_lib_toast_test["toast.test.ts"] --> frontend_src_lib_toast
  frontend_src_routes_Account["Account.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_Assignment["Assignment.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_AssignmentPanels["AssignmentPanels.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_ProfileCards["ProfileCards.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_SettingsBlinded["SettingsBlinded.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_SettingsEnsemble["SettingsEnsemble.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_SettingsReservations["SettingsReservations.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_lib_toast
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_lib_toast
```

## imports

- 없음

## imported by

- [[graph/frontend/src/components/AppShell|AppShell.tsx]]
- [[graph/frontend/src/components/PostActions|PostActions.tsx]]
- [[graph/frontend/src/components/PostAttachments|PostAttachments.tsx]]
- [[graph/frontend/src/components/PostComments|PostComments.tsx]]
- [[graph/frontend/src/components/PostWriteForm|PostWriteForm.tsx]]
- [[graph/frontend/src/components/richTextEditor|richTextEditor.ts]]
- [[graph/frontend/src/lib/toast.test|toast.test.ts]]
- [[graph/frontend/src/routes/Account|Account.tsx]]
- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
- [[graph/frontend/src/routes/AssignmentPanels|AssignmentPanels.tsx]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/ProfileCards|ProfileCards.tsx]]
- [[graph/frontend/src/routes/Settings|Settings.tsx]]
- [[graph/frontend/src/routes/SettingsBlinded|SettingsBlinded.tsx]]
- [[graph/frontend/src/routes/SettingsEnsemble|SettingsEnsemble.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/SettingsPeriods|SettingsPeriods.tsx]]
- [[graph/frontend/src/routes/SettingsReservations|SettingsReservations.tsx]]
- [[graph/frontend/src/routes/SettingsRooms|SettingsRooms.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
