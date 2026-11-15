from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .database import engine
from .dependencies import get_current_user
from .schemas import UserResponse


router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


class SessionListItem(BaseModel):
    booking_id: int
    session_id: int
    session_status: str
    skill_name: str | None
    counterpart_name: str | None
    is_learner: bool
    starts_at: datetime
    ends_at: datetime
    review_id: int | None
    review_rating: int | None


@router.get("/me", response_model=list[SessionListItem])
def list_my_sessions(
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT
                        booking.id AS booking_id,
                        lesson.id AS session_id,
                        lesson.status AS session_status,
                        skill.name AS skill_name,
                        counterpart.full_name AS counterpart_name,
                        booking.learner_id = :user_id AS is_learner,
                        slot.starts_at,
                        slot.ends_at,
                        review.id AS review_id,
                        review.rating AS review_rating
                    FROM booking_requests AS booking
                    JOIN sessions AS lesson
                        ON lesson.booking_request_id = booking.id
                    JOIN availability_slots AS slot
                        ON slot.id = booking.availability_slot_id
                    LEFT JOIN reviews AS review
                        ON review.session_id = lesson.id
                    LEFT JOIN skills AS skill
                        ON skill.id = booking.skill_id
                    LEFT JOIN users AS counterpart ON counterpart.id = CASE
                        WHEN booking.learner_id = :user_id THEN booking.teacher_id
                        ELSE booking.learner_id
                    END
                    WHERE (
                        booking.learner_id = :user_id
                        OR booking.teacher_id = :user_id
                    )
                      AND booking.status = 'ACCEPTED'
                    ORDER BY slot.starts_at, booking.id
                """),
                {"user_id": current_user.id},
            ).mappings().all()

            return [SessionListItem(**row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None