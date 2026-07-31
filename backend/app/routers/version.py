from fastapi import APIRouter

from app.schemas.version import VersionStatus
from app.services.version import check_version


router = APIRouter(prefix="/version", tags=["version"])


@router.get("", response_model=VersionStatus)
def get_version_status():
    return VersionStatus(**check_version().__dict__)
