---
source: frontend/src/components/Dropdown.tsx
kind: file
---

# Dropdown.tsx

저장소 경로 `frontend/src/components/Dropdown.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_Dropdown["Dropdown.tsx"]
  frontend_src_components_Dropdown --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_components_Dropdown --> frontend_src_lib_dropdown["dropdown.ts"]
  frontend_src_components_Dropdown_test["Dropdown.test.tsx"] --> frontend_src_components_Dropdown
  frontend_src_components_RichTextToolbar["RichTextToolbar.tsx"] --> frontend_src_components_Dropdown
  frontend_src_routes_Assignment["Assignment.tsx"] --> frontend_src_components_Dropdown
  frontend_src_routes_DayDialog["DayDialog.tsx"] --> frontend_src_components_Dropdown
  frontend_src_routes_DayDialogParts["DayDialogParts.tsx"] --> frontend_src_components_Dropdown
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_components_Dropdown
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_components_Dropdown
  frontend_src_routes_SettingsEnsemble["SettingsEnsemble.tsx"] --> frontend_src_components_Dropdown
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_components_Dropdown
```

## imports

- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/lib/dropdown|dropdown.ts]]

## imported by

- [[graph/frontend/src/components/Dropdown.test|Dropdown.test.tsx]]
- [[graph/frontend/src/components/RichTextToolbar|RichTextToolbar.tsx]]
- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
- [[graph/frontend/src/routes/DayDialog|DayDialog.tsx]]
- [[graph/frontend/src/routes/DayDialogParts|DayDialogParts.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/Settings|Settings.tsx]]
- [[graph/frontend/src/routes/SettingsEnsemble|SettingsEnsemble.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
