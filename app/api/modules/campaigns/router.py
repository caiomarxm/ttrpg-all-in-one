from fastapi import APIRouter

from modules.campaigns.http.router.campaign_router import router as campaign_http_router

router = APIRouter(prefix="/campaigns", tags=["campaigns"])
router.include_router(campaign_http_router)
