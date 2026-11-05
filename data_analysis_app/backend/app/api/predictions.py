"""Endpoint for predicting how long a planned route will take, using an already
fitted historical model run.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import pandas as pd

from .. import models
from ..database import get_db
from ..modeling.prediction import predict_route

router = APIRouter()


class PredictionRequest(BaseModel):
    run_id: str
    start_time: str  # ISO datetime, treated as a hypothetical/request-scoped value
    # Request-scoped, not saved to the activity - lets the user try multiple
    # combinations quickly without round-tripping through Activity Details.
    body_weight_lbs: float
    pack_weight_lbs: float
    party_size: float


@router.post("/activities/{activity_id}/predict")
def predict_activity_time(activity_id: str, request: PredictionRequest, db: Session = Depends(get_db)):
    """Predict per-segment and total trip time for a planned route's segments."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    try:
        start_time = pd.Timestamp(request.start_time)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid start_time: {exc}")

    try:
        return predict_route(
            db, activity_id, request.run_id, start_time,
            body_weight_lbs=request.body_weight_lbs,
            pack_weight_lbs=request.pack_weight_lbs,
            party_size=request.party_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
