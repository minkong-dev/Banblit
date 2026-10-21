---
source: frontend/src/components/Popover.tsx
kind: file
---

# Popover.tsx

저장소 경로 `frontend/src/components/Popover.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_Popover["Popover.tsx"]
  frontend_src_components_Popover --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_components_AppShell["AppShell.tsx"] --> frontend_src_components_Popover
  frontend_src_components_NotificationMenu["NotificationMenu.tsx"] --> frontend_src_components_Popover
  frontend_src_components_Popover_test["Popover.test.tsx"] --> frontend_src_components_Popover
  frontend_src_components_RichTextColor["RichTextColor.tsx"] --> frontend_src_components_Popover
  frontend_src_routes_ProfileCards["ProfileCards.tsx"] --> frontend_src_components_Popover
```

## imports

- [[graph/frontend/src/components/hooks|hooks.ts]]

## imported by

- [[graph/frontend/src/components/AppShell|AppShell.tsx]]
- [[graph/frontend/src/components/NotificationMenu|NotificationMenu.tsx]]
- [[graph/frontend/src/components/Popover.test|Popover.test.tsx]]
- [[graph/frontend/src/components/RichTextColor|RichTextColor.tsx]]
- [[graph/frontend/src/routes/ProfileCards|ProfileCards.tsx]]
