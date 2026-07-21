from fastapi import FastAPI

app = FastAPI(title="Banblit Scheduling API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
