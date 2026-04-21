"""FastAPI entrypoint: thin bootstrap — mount BC routers here; logic stays in modules."""

from fastapi import FastAPI

from modules.campaigns.router import router as campaigns_router
from modules.iam.router import router as iam_router

app = FastAPI(title="TTRPG API", version="0.1.0")

app.include_router(campaigns_router)
app.include_router(iam_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
