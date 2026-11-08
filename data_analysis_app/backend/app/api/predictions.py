"""Endpoint for predicting how long a planned route will take, using an already
fitted historical model run.
"""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import pandas as pd

from .. import models
from ..auth import get_current_user_optional, get_visible_activity
from ..database import get_db
from ..modeling.prediction import predict_route
from ..schemas import ExperienceLevel

router = APIRouter()


class PredictionRequest(BaseModel):
    run_id: str
    start_time: str  # ISO datetime, treated as a hypothetical/request-scoped value
    # Request-scoped, not saved to the activity - lets the user try multiple
    # combinations quickly without round-tripping through Activity Details.
    body_weight_lbs: float
    pack_weight_lbs: float
    party_size: float
    experience_level: ExperienceLevel


@router.post("/activities/{activity_id}/predict")
def predict_activity_time(
    activity_id: str,
    request: PredictionRequest,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
):
    """Predict per-segment and total trip time for a planned route's segments."""
    activity = get_visible_activity(activity_id, db, current_user)

    try:
        start_time = pd.Timestamp(request.start_time)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid start_time: {exc}")

    try:
        result = predict_route(
            db, activity_id, request.run_id, start_time,
            body_weight_lbs=request.body_weight_lbs,
            pack_weight_lbs=request.pack_weight_lbs,
            party_size=request.party_size,
            experience_level=request.experience_level,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Persist the latest estimate (full result + the cheap summary field the
    # activity list reads) so it survives a page reload and can be restored
    # without re-running the prediction - see get_saved_prediction below. Only
    # when an admin is making the call - /predict itself stays open to anyone
    # (a live, interactive predict experience for viewers), but an anonymous
    # visitor's inputs shouldn't be able to overwrite the admin's saved result.
    if current_user is not None and current_user.role == "admin":
        activity.predicted_total_duration_sec = result["total_mean_min"] * 60.0
        activity.predicted_result_json = json.dumps(result)
        db.commit()

    return result


@router.get("/activities/{activity_id}/predicted-result")
def get_saved_prediction(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
):
    """Most recently saved prediction result for this activity, or null if none yet."""
    activity = get_visible_activity(activity_id, db, current_user)

    if not activity.predicted_result_json:
        return None

    return json.loads(activity.predicted_result_json)
