"""Database configuration and session management."""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# SQLite database URL
SQLALCHEMY_DATABASE_URL = "sqlite:///./garmin_data.db"

# Create SQLAlchemy engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    echo=False  # Set to True for SQL query logging during development
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session.
    Used with FastAPI's Depends() for automatic session management.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
