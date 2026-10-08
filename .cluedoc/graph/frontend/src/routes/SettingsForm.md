---
source: frontend/src/routes/SettingsForm.tsx
kind: file
---

# SettingsForm.tsx

저장소 경로 `frontend/src/routes/SettingsForm.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_SettingsForm["SettingsForm.tsx"]
  frontend_src_routes_SettingsForm --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"] --> frontend_src_routes_SettingsForm
  frontend_src_routes_SettingsRooms["SettingsRooms.tsx"] --> frontend_src_routes_SettingsForm
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]

## imported by

- [[graph/frontend/src/routes/SettingsPeriods|SettingsPeriods.tsx]]
- [[graph/frontend/src/routes/SettingsRooms|SettingsRooms.tsx]]
