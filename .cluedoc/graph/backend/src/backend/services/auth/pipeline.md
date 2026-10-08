---
source: backend/src/backend/services/auth/pipeline.py
kind: file
---

# pipeline.py

저장소 경로 `backend/src/backend/services/auth/pipeline.py` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.

```mermaid
flowchart LR
  backend_src_backend_services_auth_pipeline["pipeline.py"]
  backend_src_backend_services_auth_pipeline --> backend_src_backend_services_auth_auth_service["auth_service.py"]
  backend_src_backend_services_auth_pipeline --> backend_src_backend_services_auth_auth_session["auth_session.py"]
  backend_src_backend_services_auth_pipeline --> backend_src_backend_services_auth_password_reset["password_reset.py"]
  backend_src_backend_api_auth_dependency["auth_dependency.py"] --> backend_src_backend_services_auth_pipeline
  backend_src_backend_api_routers_auth["auth.py"] --> backend_src_backend_services_auth_pipeline
  backend_tests_integration_db_test_auth_service_password_rehash["test_auth_service_password_rehash.py"] --> backend_src_backend_services_auth_pipeline
  backend_tests_integration_db_test_password_reset_endpoints["test_password_reset_endpoints.py"] --> backend_src_backend_services_auth_pipeline
```

## imports

- [[graph/backend/src/backend/services/auth/auth_service|auth_service.py]]
- [[graph/backend/src/backend/services/auth/auth_session|auth_session.py]]
- [[graph/backend/src/backend/services/auth/password_reset|password_reset.py]]

## imported by

- [[graph/backend/src/backend/api/auth_dependency|auth_dependency.py]]
- [[graph/backend/src/backend/api/routers/auth|auth.py]]
- [[graph/backend/tests/integration/db/test_auth_service_password_rehash|test_auth_service_password_rehash.py]]
- [[graph/backend/tests/integration/db/test_password_reset_endpoints|test_password_reset_endpoints.py]]
