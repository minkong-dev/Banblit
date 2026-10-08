---
source: frontend/src/routes/Landing.tsx
kind: file
---

# Landing.tsx

저장소 경로 `frontend/src/routes/Landing.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_routes_Landing["Landing.tsx"]
  frontend_src_routes_Landing --> frontend_src_components_Brand["Brand.tsx"]
  frontend_src_routes_Landing --> frontend_src_components_controls["controls.tsx"]
  frontend_src_routes_Landing --> frontend_src_components_hooks["hooks.ts"]
  frontend_src_routes_Landing --> frontend_src_components_icons["icons.tsx"]
  frontend_src_App["App.tsx"] --> frontend_src_routes_Landing
```

## imports

- [[graph/frontend/src/components/Brand|Brand.tsx]]
- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/components/hooks|hooks.ts]]
- [[graph/frontend/src/components/icons|icons.tsx]]

## imported by

- [[graph/frontend/src/App|App.tsx]]
