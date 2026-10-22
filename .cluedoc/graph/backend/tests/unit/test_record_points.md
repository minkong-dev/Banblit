---
source: backend/tests/unit/test_record_points.py
kind: file
---

# test_record_points.py

저장소 경로 `backend/tests/unit/test_record_points.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_tests_unit_test_record_points["test_record_points.py"]
  backend_tests_unit_test_record_points --> backend_src_backend_services_period_period_service["period_service.py"]
  backend_tests_unit_test_record_points --> backend_src_backend_services_period_pipeline["pipeline.py"]
```

## imports

- [[graph/backend/src/backend/services/period/period_service|period_service.py]]
- [[graph/backend/src/backend/services/period/pipeline|pipeline.py]]

## imported by

- 없음

## 함수와 호출

- `record_points`: `backend.services.period.period_service`
- `test_full_target_and_no_absence_is_100`
- `test_points_are_share_of_target_sessions`
- `test_sessions_over_target_do_not_cover_other_teams`
- `test_each_absence_takes_one_point`
- `test_points_do_not_go_below_zero`
