from pydantic import BaseModel


class CurrentChangelog(BaseModel):
    version: str
    display_version: str
    released_at: str | None
    content: str
    available: bool
    seen: bool


class ChangelogSeen(BaseModel):
    version: str
    seen: bool
