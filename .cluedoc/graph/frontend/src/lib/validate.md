---
source: frontend/src/lib/validate.ts
kind: file
---

# validate.ts

저장소 경로 `frontend/src/lib/validate.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_validate["validate.ts"]
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_validate
  frontend_src_lib_roster["roster.ts"] --> frontend_src_lib_validate
  frontend_src_lib_settings["settings.ts"] --> frontend_src_lib_validate
  frontend_src_lib_validate_test["validate.test.ts"] --> frontend_src_lib_validate
  frontend_src_routes_ProfileCards["ProfileCards.tsx"] --> frontend_src_lib_validate
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_lib_validate
```

## imports

- 없음

## imported by

- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/lib/settings|settings.ts]]
- [[graph/frontend/src/lib/validate.test|validate.test.ts]]
- [[graph/frontend/src/routes/ProfileCards|ProfileCards.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
