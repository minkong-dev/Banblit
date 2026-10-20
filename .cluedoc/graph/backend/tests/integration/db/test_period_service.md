---
source: backend/tests/integration/db/test_period_service.py
kind: file
---

# test_period_service.py

저장소 경로 `backend/tests/integration/db/test_period_service.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_tests_integration_db_test_period_service["test_period_service.py"]
  backend_tests_integration_db_test_period_service --> backend_src_backend_contract["contract.py"]
  backend_tests_integration_db_test_period_service --> backend_src_backend_db_models["models.py"]
  backend_tests_integration_db_test_period_service --> backend_src_backend_db_pipeline["pipeline.py"]
  backend_tests_integration_db_test_period_service --> backend_src_backend_services_period_pipeline["pipeline.py"]
```

## imports

- [[graph/backend/src/backend/contract|contract.py]]
- [[graph/backend/src/backend/db/models|models.py]]
- [[graph/backend/src/backend/db/pipeline|pipeline.py]]
- [[graph/backend/src/backend/services/period/pipeline|pipeline.py]]

## imported by

- 없음

## 함수와 호출

- `_period`: `backend.db.models`
- `_team_with_member`: `backend.db.models`
- `_room`: `backend.db.models`
- `test_a_run_is_kept_as_a_record_and_leaves_the_current_schedule_alone`: `backend.services.period.pipeline`
- `test_successful_assignment_round_trips_rooms_teams_and_times`: `backend.services.period.pipeline`
- `test_short_assignment_is_kept_as_an_unsaved_record`: `backend.db.models`, `backend.services.period.pipeline`
- `test_open_period_is_rejected`: `backend.services.period.pipeline`
- `test_unknown_team_is_rejected`: `backend.services.period.pipeline`
- `test_unknown_room_is_rejected`: `backend.services.period.pipeline`
- `test_every_run_adds_a_record`: `backend.services.period.pipeline`
- `test_a_run_does_not_change_the_applied_schedule`: `backend.db.pipeline`, `backend.services.period.pipeline`
- `test_unknown_period_is_rejected`: `backend.services.period.pipeline`
- `test_team_without_members_is_rejected`: `backend.db.models`, `backend.services.period.pipeline`
- `test_every_team_and_room_skips_teams_without_members`: `backend.db.models`, `backend.services.period.pipeline`
- `test_overlapping_period_room_conflict_is_rejected_not_500`: `backend.db.pipeline`, `backend.services.period.pipeline`
- `test_duplicate_team_id_is_rejected`: `backend.services.period.pipeline`
- `test_duplicate_room_id_is_rejected`: `backend.services.period.pipeline`
- `test_two_week_schedule_for_four_teams_finishes`: `backend.db.models`, `backend.services.period.pipeline`
- `test_unavailable_time_on_the_last_day_of_the_period_blocks_assignment`: `backend.db.models`, `backend.services.period.pipeline`
- `test_multiple_unavailable_times_for_the_same_person_all_block_assignment`: `backend.db.models`, `backend.services.period.pipeline`
- `test_allowed_absence_is_reported_with_position_and_cohort`: `backend.db.models`, `backend.services.period.pipeline`
- `test_the_report_flags_a_session_whose_absences_exceed_the_allowed_count`: `backend.db.models`, `backend.services.period.pipeline`
- `test_target_hours_of_the_period_replace_the_automatic_target`: `backend.services.period.pipeline`
- `test_the_period_daily_limit_caps_each_team_per_day`: `backend.services.period.pipeline`
- `test_the_period_consecutive_limit_splits_a_team_s_hours`: `backend.services.period.pipeline`
- `test_open_slots_come_from_the_saved_schedule_without_recomputing`: `backend.db.pipeline`, `backend.services.period.pipeline`
- `test_open_slots_are_empty_when_nothing_is_assigned`: `backend.services.period.pipeline`
- `test_an_everyday_period_assigns_only_the_day_of_the_run`: `backend.services.period.pipeline`
- `test_ensemble_days_are_left_out_of_team_assignment`: `backend.services.period.pipeline`
