"""api(HTTP 진입점)와 jobs(자동 배정 container)가 함께 쓰는 도메인 서비스입니다.

HTTP 를 알지 못하며, db 와 scheduling 은 각 모듈의 진입점(pipeline.py)과 공유 선언(models.py)만 참조합니다.
"""
