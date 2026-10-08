---
source: backend/src/backend/contract.py
kind: file
---

# contract.py

저장소 경로 `backend/src/backend/contract.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_contract["contract.py"]
  backend_src_backend_api_schemas["schemas.py"] --> backend_src_backend_contract
  backend_src_backend_db_models["models.py"] --> backend_src_backend_contract
  backend_src_backend_scheduling_slots["slots.py"] --> backend_src_backend_contract
  backend_src_backend_services_settings_settings_service["settings_service.py"] --> backend_src_backend_contract
  backend_src_backend_services_validation_input["input.py"] --> backend_src_backend_contract
  backend_tests_conftest["conftest.py"] --> backend_src_backend_contract
  backend_tests_integration_db_test_period_service["test_period_service.py"] --> backend_src_backend_contract
  backend_tests_integration_db_test_reject_endpoints["test_reject_endpoints.py"] --> backend_src_backend_contract
  backend_tests_integration_db_test_settings_endpoints["test_settings_endpoints.py"] --> backend_src_backend_contract
```

## imports

- 없음

## imported by

- [[graph/backend/src/backend/api/schemas|schemas.py]]
- [[graph/backend/src/backend/db/models|models.py]]
- [[graph/backend/src/backend/scheduling/slots|slots.py]]
- [[graph/backend/src/backend/services/settings/settings_service|settings_service.py]]
- [[graph/backend/src/backend/services/validation/input|input.py]]
- [[graph/backend/tests/conftest|conftest.py]]
- [[graph/backend/tests/integration/db/test_period_service|test_period_service.py]]
- [[graph/backend/tests/integration/db/test_reject_endpoints|test_reject_endpoints.py]]
- [[graph/backend/tests/integration/db/test_settings_endpoints|test_settings_endpoints.py]]
