---
source: frontend/src/components/MemberSearch.tsx
kind: file
---

# MemberSearch.tsx

저장소 경로 `frontend/src/components/MemberSearch.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_MemberSearch["MemberSearch.tsx"]
  frontend_src_components_MemberSearch --> frontend_src_components_controls["controls.tsx"]
  frontend_src_components_MemberSearch --> frontend_src_lib_api["api.ts"]
  frontend_src_components_MemberSearch --> frontend_src_lib_contract["contract.ts"]
  frontend_src_components_MemberSearch --> frontend_src_lib_loading["loading.ts"]
  frontend_src_components_MemberSearch --> frontend_src_lib_pipeline["pipeline.ts"]
  frontend_src_components_MemberPicker_test["MemberPicker.test.tsx"] --> frontend_src_components_MemberSearch
  frontend_src_components_MemberPicker["MemberPicker.tsx"] --> frontend_src_components_MemberSearch
  frontend_src_components_MemberSearch_test["MemberSearch.test.tsx"] --> frontend_src_components_MemberSearch
```

## imports

- [[graph/frontend/src/components/controls|controls.tsx]]
- [[graph/frontend/src/lib/api|api.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/loading|loading.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]

## imported by

- [[graph/frontend/src/components/MemberPicker.test|MemberPicker.test.tsx]]
- [[graph/frontend/src/components/MemberPicker|MemberPicker.tsx]]
- [[graph/frontend/src/components/MemberSearch.test|MemberSearch.test.tsx]]
