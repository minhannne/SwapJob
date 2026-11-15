from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import engine
from .dependencies import get_current_user
from .schemas import (
    ReviewCreateRequest,
    ReviewResponse,
    TeacherReviewItem,
    TeacherReviewsResponse,
    UserResponse,
)


router = APIRouter(
    prefix="/api/reviews",
    tags=["Reviews"],
)


@router.post(
    "",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    data: ReviewCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            # Khóa buổi học để tuần tự hóa các lần gửi đánh giá.
            session = connection.execute(
                text("""
                    SELECT
                        lesson.id,
                        lesson.status AS session_status,
                        booking.id AS booking_id,
                        booking.learner_id,
                        booking.status AS booking_status,
                        slot.ends_at
                    FROM sessions AS lesson
                    JOIN booking_requests AS booking
                        ON booking.id = lesson.booking_request_id
                    JOIN availability_slots AS slot
                        ON slot.id = booking.availability_slot_id
                    WHERE booking.id = :booking_id
                    FOR UPDATE OF lesson
                """),
                {"booking_id": data.booking_id},
            ).mappings().one_or_none()

            if session is None:
                raise HTTPException(
                    status_code=404,
                    detail="Session not found",
                )

            if session["learner_id"] != current_user.id:
                raise HTTPException(
                    status_code=403,
                    detail="Only the learner of this session can review it",
                )

            if (
                session["booking_status"] != "ACCEPTED"
                or session["session_status"] == "CANCELLED"
            ):
                raise HTTPException(
                    status_code=409,
                    detail="This session is not eligible for a review",
                )

            if session["ends_at"] > datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=409,
                    detail="You can review a session after its end time",
                )

            existing_review = connection.execute(
                text("""
                    SELECT id
                    FROM reviews
                    WHERE session_id = :session_id
                """),
                {"session_id": session["id"]},
            ).scalar_one_or_none()

            if existing_review is not None:
                raise HTTPException(
                    status_code=409,
                    detail="This session has already been reviewed",
                )

            row = connection.execute(
                text("""
                    INSERT INTO reviews (session_id, rating, comment)
                    VALUES (:session_id, :rating, :comment)
                    RETURNING
                        id,
                        session_id,
                        rating,
                        comment,
                        created_at
                """),
                {
                    "session_id": session["id"],
                    "rating": data.rating,
                    "comment": data.comment,
                },
            ).mappings().one()

            result = ReviewResponse(
                **row,
                booking_id=session["booking_id"],
            )

        return result

    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Review conflicts with existing or related data",
        ) from None

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None


@router.get(
    "/teachers/{teacher_id}",
    response_model=TeacherReviewsResponse,
)
def list_teacher_reviews(
    teacher_id: int = Path(gt=0, le=9223372036854775807),
    before_id: int | None = Query(
        default=None,
        gt=0,
        le=9223372036854775807,
    ),
    current_user: UserResponse = Depends(get_current_user),
):
    page_size = 10

    try:
        with engine.connect() as connection:
            teacher_exists = connection.execute(
                text("""
                    SELECT id
                    FROM users
                    WHERE id = :teacher_id
                """),
                {"teacher_id": teacher_id},
            ).scalar_one_or_none()

            if teacher_exists is None:
                raise HTTPException(
                    status_code=404,
                    detail="Teacher not found",
                )

            summary = connection.execute(
                text("""
                    SELECT
                        COUNT(*) AS total_reviews,
                        AVG(review.rating)::double precision AS average_rating
                    FROM reviews AS review
                    JOIN sessions AS lesson
                        ON lesson.id = review.session_id
                    JOIN booking_requests AS booking
                        ON booking.id = lesson.booking_request_id
                    WHERE booking.teacher_id = :teacher_id
                """),
                {"teacher_id": teacher_id},
            ).mappings().one()

            rows = connection.execute(
                text("""
                    SELECT
                        review.id,
                        review.session_id,
                        booking.id AS booking_id,
                        review.rating,
                        review.comment,
                        review.created_at,
                        learner.full_name AS learner_name,
                        skill.name AS skill_name
                    FROM reviews AS review
                    JOIN sessions AS lesson
                        ON lesson.id = review.session_id
                    JOIN booking_requests AS booking
                        ON booking.id = lesson.booking_request_id
                    JOIN users AS learner
                        ON learner.id = booking.learner_id
                    JOIN skills AS skill
                        ON skill.id = booking.skill_id
                    WHERE booking.teacher_id = :teacher_id
                      AND (
                          CAST(:before_id AS bigint) IS NULL
                          OR review.id < :before_id
                      )
                    ORDER BY review.id DESC
                    LIMIT :limit
                """),
                {
                    "teacher_id": teacher_id,
                    "before_id": before_id,
                    "limit": page_size + 1,
                },
            ).mappings().all()

            items = [
                TeacherReviewItem(**row)
                for row in rows[:page_size]
            ]

            return TeacherReviewsResponse(
                teacher_id=teacher_id,
                average_rating=summary["average_rating"],
                total_reviews=summary["total_reviews"],
                items=items,
                next_cursor=items[-1].id if len(rows) > page_size else None,
            )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None