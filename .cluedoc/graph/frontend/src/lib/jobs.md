---
source: frontend/src/lib/jobs.ts
kind: file
---

# jobs.ts

저장소 경로 `frontend/src/lib/jobs.ts` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  frontend_src_lib_jobs["jobs.ts"]
  frontend_src_lib_jobs_test["jobs.test.ts"] --> frontend_src_lib_jobs
  frontend_src_lib_pipeline["pipeline.ts"] --> frontend_src_lib_jobs
```

## imports

- 없음

## imported by

- [[graph/frontend/src/lib/jobs.test|jobs.test.ts]]
- [[graph/frontend/src/lib/pipeline|pipeline.ts]]
