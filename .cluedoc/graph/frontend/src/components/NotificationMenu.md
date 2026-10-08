---
source: frontend/src/components/NotificationMenu.tsx
kind: file
---

# NotificationMenu.tsx

저장소 경로 `frontend/src/components/NotificationMenu.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_NotificationMenu["NotificationMenu.tsx"]
  frontend_src_components_NotificationMenu --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_NotificationMenu --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_components_NotificationMenu --> frontend_src_components_icons["icons.tsx"]
  frontend_src_components_NotificationMenu --> frontend_src_lib_loading["loading.ts"]
  frontend_src_components_NotificationMenu --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_components_AppShell["AppShell.tsx"] --> frontend_src_components_NotificationMenu
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/components/icons|icons.tsx]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]

## imported by

- [[graph/frontend/src/components/AppShell|AppShell.tsx]]
