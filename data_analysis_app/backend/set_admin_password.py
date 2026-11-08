"""
One-time setup script for Milestone 1.0 phase 2 (login).

Sets (or resets) the admin user's password. Kept as a local script rather than
an API endpoint - there's no "forgot password" flow to build yet, and this way a
password-set action never has to exist on the open internet unauthenticated.

Usage:
    python set_admin_password.py <new-password>
"""
import sys

from app.auth import hash_password
from app.database import SessionLocal
from app.models import User


def set_admin_password(password: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.role == "admin").first()
        if user is None:
            print("No admin user found - run seed_admin_user.py first.")
            sys.exit(1)

        user.password_hash = hash_password(password)
        db.commit()
        print(f"Password set for admin user: {user.email}")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python set_admin_password.py <new-password>")
        sys.exit(1)
    set_admin_password(sys.argv[1])
