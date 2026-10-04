from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.db import init_db
from domain.statistics import build_statistics
from domain.verification import verify_records
from domain.settlement import build_settlement

app = FastAPI(title="CB Edu Clinic V13 Hybrid Engine", version="13.0.0-alpha")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1", "http://localhost", "null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "engine": "python", "version": "13.0.0-alpha"}


@app.post("/api/statistics")
def statistics(payload: dict) -> dict:
    return build_statistics(payload)


@app.post("/api/verification")
def verification(payload: dict) -> dict:
    return verify_records(payload)


@app.post("/api/settlement")
def settlement(payload: dict) -> dict:
    return build_settlement(payload)
