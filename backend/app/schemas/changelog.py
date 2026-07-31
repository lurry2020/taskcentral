from pydantic import BaseModel


class CurrentChangelog(BaseModel):
    version: str
    display_version: str
    content: str
    available: bool
    seen: bool


class ChangelogSeen(BaseModel):
    version: str
    seen: bool
