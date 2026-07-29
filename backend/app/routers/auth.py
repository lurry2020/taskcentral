from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.auth import check_credentials, create_token, get_login_username, verify_token
from app.services.setup import is_setup_complete

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=400)


class LoginResponse(BaseModel):
    token: str
    username: str


class UserResponse(BaseModel):
    username: str


def current_user(authorization: str = Header(default="")) -> str:
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    username = verify_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    if not is_setup_complete(db):
        raise HTTPException(
            status_code=409,
            detail="Complete initial setup before signing in.",
        )
    if not check_credentials(db, payload.username, payload.password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    username = get_login_username(db)
    return LoginResponse(token=create_token(username), username=username)


@router.get("/me", response_model=UserResponse)
def me(username: str = Depends(current_user)):
    return UserResponse(username=username)
