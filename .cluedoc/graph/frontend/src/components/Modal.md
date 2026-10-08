---
source: frontend/src/components/Modal.tsx
kind: file
---

# Modal.tsx

저장소 경로 `frontend/src/components/Modal.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_Modal["Modal.tsx"]
  frontend_src_components_Modal --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_MemberPicker_test["MemberPicker.test.tsx"] --> frontend_src_components_Modal
  frontend_src_components_MemberPicker["MemberPicker.tsx"] --> frontend_src_components_Modal
  frontend_src_components_PostActions["PostActions.tsx"] --> frontend_src_components_Modal
  frontend_src_components_PostComments["PostComments.tsx"] --> frontend_src_components_Modal
  frontend_src_components_RejectDialog["RejectDialog.tsx"] --> frontend_src_components_Modal
  frontend_src_components_RichTextToolbar["RichTextToolbar.tsx"] --> frontend_src_components_Modal
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_components_Modal
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_components_Modal
  frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"] --> frontend_src_components_Modal
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"] --> frontend_src_components_Modal
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_components_Modal
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]

## imported by

- [[graph/frontend/src/components/MemberPicker.test|MemberPicker.test.tsx]]
- [[graph/frontend/src/components/MemberPicker|MemberPicker.tsx]]
- [[graph/frontend/src/components/PostActions|PostActions.tsx]]
- [[graph/frontend/src/components/PostComments|PostComments.tsx]]
- [[graph/frontend/src/components/RejectDialog|RejectDialog.tsx]]
- [[graph/frontend/src/components/RichTextToolbar|RichTextToolbar.tsx]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/SettingsPeriods|SettingsPeriods.tsx]]
- [[graph/frontend/src/routes/SettingsRooms|SettingsRooms.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
