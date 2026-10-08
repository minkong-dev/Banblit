---
source: frontend/src/components/AppShell.tsx
kind: file
---

# AppShell.tsx

저장소 경로 `frontend/src/components/AppShell.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_AppShell["AppShell.tsx"]
  frontend_src_components_AppShell --> frontend_src_components_Avatar["Avatar.tsx"]
  frontend_src_components_AppShell --> frontend_src_components_Brand["Brand.tsx"]
  frontend_src_components_AppShell --> frontend_src_components_NotificationMenu["NotificationMenu.tsx"]
  frontend_src_components_AppShell --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_AppShell --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_components_AppShell --> frontend_src_components_icons["icons.tsx"]
  frontend_src_components_AppShell --> frontend_src_components_queries["queries.ts"]
  frontend_src_components_AppShell --> frontend_src_lib_account["account.ts"]
  frontend_src_components_AppShell --> frontend_src_lib_adminMenu["adminMenu.ts"]
  frontend_src_components_AppShell --> frontend_src_lib_contract["contract.ts"]
  frontend_src_components_AppShell --> frontend_src_lib_loading["loading.ts"]
  frontend_src_components_AppShell --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_components_AppShell --> frontend_src_lib_roster["roster.ts"]
  frontend_src_components_AppShell --> frontend_src_lib_theme["theme.ts"]
  frontend_src_components_AppShell --> frontend_src_lib_toast["toast.ts"]
  frontend_src_App["App.tsx"] --> frontend_src_components_AppShell
```

## imports

- [[graph/frontend/src/components/Avatar|Avatar.tsx]]
- [[graph/frontend/src/components/Brand|Brand.tsx]]
- [[graph/frontend/src/components/NotificationMenu|NotificationMenu.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/components/icons|icons.tsx]]
- [[graph/frontend/src/components/queries|queries.ts]]
- [[graph/frontend/src/lib/account|account.ts]]
- [[graph/frontend/src/lib/adminMenu|adminMenu.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
- [[graph/frontend/src/lib/roster|roster.ts]]
- [[graph/frontend/src/lib/theme|theme.ts]]
- [[graph/frontend/src/lib/toast|toast.ts]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
