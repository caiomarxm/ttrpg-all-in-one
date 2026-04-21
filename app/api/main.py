"""FastAPI entrypoint: thin bootstrap — mount BC routers here; logic stays in modules."""

from fastapi import FastAPI

from modules.shared.router import router as shared_router

app = FastAPI(title="TTRPG API", version="0.1.0")

app.include_router(shared_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
