"""
One-time setup script for Milestone 1.0 phase 1 (tenancy foundation).

Creates the single admin User row (email only - password_hash stays NULL until
phase 2's login setup sets a real password) and backfills owner_id on every
existing Activity to point at it. Safe to re-run: skips creation if an admin
user already exists, and only backfills activities that still have a NULL
owner_id.

Usage:
    python seed_admin_user.py you@example.com
"""
import sys

from app.database import SessionLocal
from app.models import Activity, User


def seed_admin_user(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.role == "admin").first()
        if user is None:
            user = User(email=email, role="admin")
            db.add(user)
            db.commit()
            print(f"Created admin user: {email} (id={user.id})")
        else:
            print(f"Admin user already exists: {user.email} (id={user.id}) - skipping creation")

        updated = (
            db.query(Activity)
            .filter(Activity.owner_id.is_(None))
            .update({Activity.owner_id: user.id})
        )
        db.commit()
        print(f"Backfilled owner_id on {updated} activity row(s)")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python seed_admin_user.py <your-email>")
        sys.exit(1)
    seed_admin_user(sys.argv[1])
