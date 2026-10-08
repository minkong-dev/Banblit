---
source: frontend/src/lib/account.ts
kind: file
---

# account.ts

저장소 경로 `frontend/src/lib/account.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_account["account.ts"]
  frontend_src_lib_account --> frontend_src_lib_contract["contract.ts"]
  frontend_src_components_AppShell["AppShell.tsx"] --> frontend_src_lib_account
  frontend_src_lib_account_test["account.test.ts"] --> frontend_src_lib_account
  frontend_src_routes_Assignment["Assignment.tsx"] --> frontend_src_lib_account
  frontend_src_routes_Board["Board.tsx"] --> frontend_src_lib_account
  frontend_src_routes_Notices["Notices.tsx"] --> frontend_src_lib_account
  frontend_src_routes_PostWrite["PostWrite.tsx"] --> frontend_src_lib_account
  frontend_src_routes_ProfileCards["ProfileCards.tsx"] --> frontend_src_lib_account
  frontend_src_routes_Scheduler["Scheduler.tsx"] --> frontend_src_lib_account
  frontend_src_routes_Settings["Settings.tsx"] --> frontend_src_lib_account
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_lib_account
  frontend_src_routes_SettingsUnavailable["SettingsUnavailable.tsx"] --> frontend_src_lib_account
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_lib_account
```

## imports

- [[graph/frontend/src/lib/contract|contract.ts]]

## imported by

- [[graph/frontend/src/components/AppShell|AppShell.tsx]]
- [[graph/frontend/src/lib/account.test|account.test.ts]]
- [[graph/frontend/src/routes/Assignment|Assignment.tsx]]
- [[graph/frontend/src/routes/Board|Board.tsx]]
- [[graph/frontend/src/routes/Notices|Notices.tsx]]
- [[graph/frontend/src/routes/PostWrite|PostWrite.tsx]]
- [[graph/frontend/src/routes/ProfileCards|ProfileCards.tsx]]
- [[graph/frontend/src/routes/Scheduler|Scheduler.tsx]]
- [[graph/frontend/src/routes/Settings|Settings.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/SettingsUnavailable|SettingsUnavailable.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
