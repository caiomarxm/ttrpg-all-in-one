from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def iam_namespace_ok() -> dict[str, str]:
    """Placeholder until IAM / Firebase bootstrap lands."""
    return {"bc": "iam"}
