from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import IntegrationToken
from app.schemas.integrations import (
    IntegrationTokenCreate,
    IntegrationTokenCreated,
    IntegrationTokenOut,
)
from app.services.integration_tokens import (
    create_integration_token,
    parse_scopes,
    revoke_integration_token,
)

router = APIRouter(prefix="/settings/integration-tokens", tags=["integration tokens"])


def token_out(record: IntegrationToken) -> IntegrationTokenOut:
    return IntegrationTokenOut(
        id=record.id,
        name=record.name,
        token_prefix=record.token_prefix,
        scopes=parse_scopes(record.scopes),
        created_at=record.created_at,
        last_used_at=record.last_used_at,
        revoked_at=record.revoked_at,
        active=record.revoked_at is None,
    )


@router.get("", response_model=list[IntegrationTokenOut])
def list_integration_tokens(db: Session = Depends(get_db)):
    records = db.scalars(
        select(IntegrationToken).order_by(
            IntegrationToken.created_at.desc(), IntegrationToken.id.desc()
        )
    )
    return [token_out(record) for record in records]


@router.post("", response_model=IntegrationTokenCreated, status_code=201)
def create_token(
    payload: IntegrationTokenCreate,
    response: Response,
    db: Session = Depends(get_db),
):
    record, plaintext = create_integration_token(db, payload.name, payload.scopes)
    db.commit()
    db.refresh(record)
    response.headers["Cache-Control"] = "no-store"
    return IntegrationTokenCreated(**token_out(record).model_dump(), token=plaintext)


@router.post("/{token_id}/revoke", response_model=IntegrationTokenOut)
def revoke_token(token_id: int, db: Session = Depends(get_db)):
    record = db.get(IntegrationToken, token_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Integration token not found")
    if revoke_integration_token(record):
        db.commit()
        db.refresh(record)
    return token_out(record)
