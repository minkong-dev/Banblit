---
source: frontend/src/components/MemberPicker.tsx
kind: file
---

# MemberPicker.tsx

저장소 경로 `frontend/src/components/MemberPicker.tsx` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_components_MemberPicker["MemberPicker.tsx"]
  frontend_src_components_MemberPicker --> frontend_src_components_MemberSearch["MemberSearch.tsx"]
  frontend_src_components_MemberPicker --> frontend_src_components_Modal["Modal.tsx"]
  frontend_src_components_MemberPicker --> frontend_src_lib_contract["contract.ts"]
  frontend_src_components_MemberPicker_test["MemberPicker.test.tsx"] --> frontend_src_components_MemberPicker
  frontend_src_routes_SettingsMembers["SettingsMembers.tsx"] --> frontend_src_components_MemberPicker
  frontend_src_routes_Teams["Teams.tsx"] --> frontend_src_components_MemberPicker
```

## imports

- [[graph/frontend/src/components/MemberSearch|MemberSearch.tsx]]
- [[graph/frontend/src/components/Modal|Modal.tsx]]
- [[graph/frontend/src/lib/contract|contract.ts]]

## imported by

- [[graph/frontend/src/components/MemberPicker.test|MemberPicker.test.tsx]]
- [[graph/frontend/src/routes/SettingsMembers|SettingsMembers.tsx]]
- [[graph/frontend/src/routes/Teams|Teams.tsx]]
