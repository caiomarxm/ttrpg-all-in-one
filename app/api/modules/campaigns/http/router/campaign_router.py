from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def campaigns_namespace_ok() -> dict[str, str]:
    """Placeholder until Campaigns REST endpoints land."""
    return {"bc": "campaigns"}
