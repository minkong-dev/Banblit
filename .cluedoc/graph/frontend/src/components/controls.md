---
source: frontend/src/components/controls.tsx
kind: file
---

# controls.tsx

저장소 경로 `frontend/src/components/controls.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_controls["controls.tsx"]
  frontend_src_components_controls --> frontend_src_components_icons["icons.tsx"]
  frontend_src_components_controls --> frontend_src_lib_loading["loading.ts"]
  frontend_src_components_AppShell["AppShell.tsx"] --> frontend_src_components_controls
  frontend_src_components_ErrorBoundary["ErrorBoundary.tsx"] --> frontend_src_components_controls
  frontend_src_components_MemberSearch["MemberSearch.tsx"] --> frontend_src_components_controls
  frontend_src_components_Modal["Modal.tsx"] --> frontend_src_components_controls
  frontend_src_components_NotificationMenu["NotificationMenu.tsx"] --> frontend_src_components_controls
  frontend_src_components_Pager["Pager.tsx"] --> frontend_src_components_controls
  frontend_src_components_PostActions["PostActions.tsx"] --> frontend_src_components_controls
  frontend_src_components_PostAttachments["PostAttachments.tsx"] --> frontend_src_components_controls
  frontend_src_components_PostBoard["PostBoard.tsx"] --> frontend_src_components_controls
  frontend_src_components_PostComments["PostComments.tsx"] --> frontend_src_components_controls
  frontend_src_components_PostWriteForm["PostWriteForm.tsx"] --> frontend_src_components_controls
  frontend_src_components_RejectDialog["RejectDialog.tsx"] --> frontend_src_components_controls
  frontend_src_components_RichTextToolbar["RichTextToolbar.tsx"] --> frontend_src_components_controls
  frontend_src_components_controls_test["controls.test.tsx"] --> frontend_src_components_controls
  frontend_src_routes_Account["Account.tsx"] --> frontend_src_components_controls
  frontend_src_routes_Assignment["Assignment.tsx"] --> frontend_src_components_controls
  frontend_src_routes_AssignmentPanels["AssignmentPanels.tsx"] --> frontend_src_components_controls
  frontend_src_routes_Board["Board.tsx"] --> frontend_src_components_controls
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_components_controls
  frontend_src_routes_DayDialogParts["DayDialogParts.tsx"] --> frontend_src_components_controls
  frontend_src_routes_Landing["Landing.tsx"] --> frontend_src_components_controls
  frontend_src_routes_NotFound["NotFound.tsx"] --> frontend_src_components_controls
  frontend_src_routes_PostWrite["PostWrite.tsx"] --> frontend_src_components_controls
  frontend_src_routes_Profile["Profile.tsx"] --> frontend_src_components_controls
  frontend_src_routes_ProfileCards["ProfileCards.tsx"] --> frontend_src_components_controls
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_components_controls
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_components_controls
  frontend_src_routes_SettingsBlinded["SettingsBlinded.tsx"] --> frontend_src_components_controls
  frontend_src_routes_SettingsEnsemble["SettingsEnsemble.tsx"] --> frontend_src_components_controls
  frontend_src_routes_SettingsForm["SettingsForm.tsx"] --> frontend_src_components_controls
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_components_controls
  frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"] --> frontend_src_components_controls
  frontend_src_routes_SettingsReservations["SettingsReservations.tsx"] --> frontend_src_components_controls
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"] --> frontend_src_components_controls
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_components_controls
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_components_controls
```

## imports

- [[graph/frontend/src/components/icons|icons.tsx]]
- [[graph/frontend/src/lib/loading|loading.ts]]

## imported by

- [[graph/frontend/src/components/AppShell|AppShell.tsx]]
- [[graph/frontend/src/components/ErrorBoundary|ErrorBoundary.tsx]]
- [[graph/frontend/src/components/MemberSearch|MemberSearch.tsx]]
- [[graph/frontend/src/components/Modal|Modal.tsx]]
- [[graph/frontend/src/components/NotificationMenu|NotificationMenu.tsx]]
- [[graph/frontend/src/components/Pager|Pager.tsx]]
- [[graph/frontend/src/components/PostActions|PostActions.tsx]]
- [[graph/frontend/src/components/PostAttachments|PostAttachments.tsx]]
- [[graph/frontend/src/components/PostBoard|PostBoard.tsx]]
- [[graph/frontend/src/components/PostComments|PostComments.tsx]]
- [[graph/frontend/src/components/PostWriteForm|PostWriteForm.tsx]]
- [[graph/frontend/src/components/RejectDialog|RejectDialog.tsx]]
- [[graph/frontend/src/components/RichTextToolbar|RichTextToolbar.tsx]]
- [[graph/frontend/src/components/controls.test|controls.test.tsx]]
- [[graph/frontend/src/routes/Account|Account.tsx]]
- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
- [[graph/frontend/src/routes/AssignmentPanels|AssignmentPanels.tsx]]
- [[graph/frontend/src/routes/Board|Board.tsx]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/DayDialogParts|DayDialogParts.tsx]]
- [[graph/frontend/src/routes/Landing|Landing.tsx]]
- [[graph/frontend/src/routes/NotFound|NotFound.tsx]]
- [[graph/frontend/src/routes/PostWrite|PostWrite.tsx]]
- [[graph/frontend/src/routes/Profile|Profile.tsx]]
- [[graph/frontend/src/routes/ProfileCards|ProfileCards.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/Settings|Settings.tsx]]
- [[graph/frontend/src/routes/SettingsBlinded|SettingsBlinded.tsx]]
- [[graph/frontend/src/routes/SettingsEnsemble|SettingsEnsemble.tsx]]
- [[graph/frontend/src/routes/SettingsForm|SettingsForm.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/SettingsPeriods|SettingsPeriods.tsx]]
- [[graph/frontend/src/routes/SettingsReservations|SettingsReservations.tsx]]
- [[graph/frontend/src/routes/SettingsRooms|SettingsRooms.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
