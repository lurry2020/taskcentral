from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class VersionStatus(BaseModel):
    current_version: str
    latest_version: str | None
    status: Literal["up_to_date", "update_available", "check_failed"]
    checked_at: datetime
    releases_url: str
    message: str
