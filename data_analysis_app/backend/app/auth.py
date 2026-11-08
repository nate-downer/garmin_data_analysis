"""Password hashing and session-based auth (Milestone 1.0 phase 2).

Session state lives in Starlette's signed httpOnly cookie (see SessionMiddleware
in main.py) - there's no server-side session table, just a user_id stashed in the
signed cookie payload.
"""
from typing import Optional

from fastapi import Depends, HTTPException, Request
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from . import models
from .database import get_db


def is_admin_user(user: Optional["models.User"]) -> bool:
    return user is not None and user.role == "admin"


def hash_password(password: str) -> str:
    return bcrypt.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.verify(password, password_hash)


def get_current_user(request: Request, db: Session) -> Optional[models.User]:
    user_id = request.session.get("user_id")
    if user_id is None:
        return None
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_current_user_optional(
    request: Request, db: Session = Depends(get_db)
) -> Optional[models.User]:
    """Never raises - used by routes that work for anyone but behave differently
    when an admin happens to be logged in (e.g. /predict's auto-save)."""
    return get_current_user(request, db)


def require_admin(request: Request, db: Session = Depends(get_db)) -> models.User:
    """Dependency for every mutating route. 401 covers both "not logged in" and
    "logged in but not admin" - there's no other role that can be authenticated
    yet, so a finer-grained 403 isn't meaningfully different today."""
    user = get_current_user(request, db)
    if not is_admin_user(user):
        raise HTTPException(status_code=401, detail="Admin login required")
    return user


def get_visible_activity(
    activity_id: str, db: Session, current_user: Optional[models.User]
) -> models.Activity:
    """Fetch-or-404 for a single activity, folding in the privacy check (Milestone
    1.0 phase 3): a private activity 404s for anyone but its admin, identically to
    a nonexistent one - no "it exists but you can't see it" signal leaks out."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if activity is None or (not activity.is_public and not is_admin_user(current_user)):
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity
