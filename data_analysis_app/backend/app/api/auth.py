"""Login/logout/me endpoints (Milestone 1.0 phase 2)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_user, verify_password
from ..database import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if user is None or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    request.session["user_id"] = user.id
    return {"email": user.email, "role": user.role}


@router.post("/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"message": "Logged out"}


@router.get("/auth/me")
def me(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if user is None:
        return {"authenticated": False}
    return {"authenticated": True, "email": user.email, "role": user.role}
