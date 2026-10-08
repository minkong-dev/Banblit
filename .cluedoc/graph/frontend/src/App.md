---
source: frontend/src/App.tsx
kind: file
---

# App.tsx

저장소 경로 `frontend/src/App.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_App["App.tsx"]
  frontend_src_App --> frontend_src_components_AppShell["AppShell.tsx"]
  frontend_src_App --> frontend_src_lib_adminMenu["adminMenu.ts"]
  frontend_src_App --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_App --> frontend_src_routes_Account["Account.tsx"]
  frontend_src_App --> frontend_src_routes_Assignment["Assignment.tsx"]
  frontend_src_App --> frontend_src_routes_Board["Board.tsx"]
  frontend_src_App --> frontend_src_routes_Landing["Landing.tsx"]
  frontend_src_App --> frontend_src_routes_NotFound["NotFound.tsx"]
  frontend_src_App --> frontend_src_routes_Notices["Notices.tsx"]
  frontend_src_App --> frontend_src_routes_PostWrite["PostWrite.tsx"]
  frontend_src_App --> frontend_src_routes_Profile["Profile.tsx"]
  frontend_src_App --> frontend_src_routes_Scheduler["Scheduler.tsx"]
  frontend_src_App --> frontend_src_routes_Settings["Settings.tsx"]
  frontend_src_App --> frontend_src_routes_Teams["Teams.tsx"]
  frontend_src_main["main.tsx"] --> frontend_src_App
```

## imports

- [[graph/frontend/src/components/AppShell|AppShell.tsx]]
- [[graph/frontend/src/lib/adminMenu|adminMenu.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/routes/Account|Account.tsx]]
- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
- [[graph/frontend/src/routes/Board|Board.tsx]]
- [[graph/frontend/src/routes/Landing|Landing.tsx]]
- [[graph/frontend/src/routes/NotFound|NotFound.tsx]]
- [[graph/frontend/src/routes/Notices|Notices.tsx]]
- [[graph/frontend/src/routes/PostWrite|PostWrite.tsx]]
- [[graph/frontend/src/routes/Profile|Profile.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/Settings|Settings.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]

## imported by

- [[graph/frontend/src/main|main.tsx]]
