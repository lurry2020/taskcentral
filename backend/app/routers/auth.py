from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.services.auth import (
    SESSION_COOKIE_NAME,
    check_credentials,
    create_session,
    get_login_username,
    revoke_session,
)
from app.services.setup import is_setup_complete

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=400)


class LoginResponse(BaseModel):
    username: str


class UserResponse(BaseModel):
    username: str


def current_user(request: Request) -> str:
    username = getattr(request.state, "auth_username", None)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    if not is_setup_complete(db):
        raise HTTPException(
            status_code=409,
            detail="Complete initial setup before signing in.",
        )
    if not check_credentials(db, payload.username, payload.password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    username = get_login_username(db)
    token, lifetime_seconds = create_session(db, username)
    db.commit()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=lifetime_seconds,
        httponly=True,
        secure=get_settings().session_cookie_secure,
        samesite="strict",
        path="/api",
    )
    return LoginResponse(username=username)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    revoke_session(db, request.cookies.get(SESSION_COOKIE_NAME))
    db.commit()
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/api",
        secure=get_settings().session_cookie_secure,
        httponly=True,
        samesite="strict",
    )
    response.status_code = 204
    return response


@router.get("/me", response_model=UserResponse)
def me(username: str = Depends(current_user)):
    return UserResponse(username=username)
