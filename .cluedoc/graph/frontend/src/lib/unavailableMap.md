---
source: frontend/src/lib/unavailableMap.ts
kind: file
---

# unavailableMap.ts

저장소 경로 `frontend/src/lib/unavailableMap.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_unavailableMap["unavailableMap.ts"]
  frontend_src_lib_unavailableMap --> frontend_src_lib_calendar["calendar.ts"]
  frontend_src_lib_unavailableMap --> frontend_src_lib_contract["contract.ts"]
  frontend_src_lib_unavailableMap --> frontend_src_lib_dayEntries["dayEntries.ts"]
  frontend_src_lib_unavailableMap_test["unavailableMap.test.ts"] --> frontend_src_lib_unavailableMap
```

## imports

- [[graph/frontend/src/lib/calendar|calendar.ts]]
- [[graph/frontend/src/lib/contract|contract.ts]]
- [[graph/frontend/src/lib/dayEntries|dayEntries.ts]]

## imported by

- [[graph/frontend/src/lib/unavailableMap.test|unavailableMap.test.ts]]
