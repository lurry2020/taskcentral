from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.changelog import ChangelogSeen, CurrentChangelog
from app.services.changelog import (
    current_changelog,
    has_seen_current_changelog,
    mark_current_changelog_seen,
)


router = APIRouter(prefix="/changelog", tags=["changelog"])


@router.get("/current", response_model=CurrentChangelog)
def get_current_changelog(db: Session = Depends(get_db)):
    entry = current_changelog()
    return CurrentChangelog(
        **entry.__dict__,
        seen=has_seen_current_changelog(db, entry.version),
    )


@router.post("/current/seen", response_model=ChangelogSeen)
def mark_changelog_seen(db: Session = Depends(get_db)):
    entry = current_changelog()
    mark_current_changelog_seen(db, entry.version)
    return ChangelogSeen(version=entry.version, seen=True)
