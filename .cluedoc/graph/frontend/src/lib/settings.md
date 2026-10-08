---
source: frontend/src/lib/settings.ts
kind: file
---

# settings.ts

저장소 경로 `frontend/src/lib/settings.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_settings["settings.ts"]
  frontend_src_lib_settings --> frontend_src_lib_validate["validate.ts"]
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_settings
  frontend_src_lib_settings_test["settings.test.ts"] --> frontend_src_lib_settings
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_lib_settings
  frontend_src_routes_SettingsPeriods["SettingsPeriods.tsx"] --> frontend_src_lib_settings
```

## imports

- [[graph/frontend/src/lib/validate|validate.ts]]

## imported by

- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/settings.test|settings.test.ts]]
- [[graph/frontend/src/routes/Settings|Settings.tsx]]
- [[graph/frontend/src/routes/SettingsPeriods|SettingsPeriods.tsx]]
