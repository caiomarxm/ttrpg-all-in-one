from fastapi import APIRouter

from modules.iam.http.router.iam_router import router as iam_http_router

router = APIRouter(prefix="/iam", tags=["iam"])
router.include_router(iam_http_router)
