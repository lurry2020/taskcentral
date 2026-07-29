from sqlalchemy.orm import Session

from app.models import ActivityEvent


def log_event(db: Session, event_type: str, description: str, machine_id: int | None = None) -> None:
    db.add(ActivityEvent(machine_id=machine_id, event_type=event_type, description=description))
