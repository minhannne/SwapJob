from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import engine
from .dependencies import get_current_user
from .schemas import (
    AvailabilityCreateRequest,
    AvailabilityResponse,
    UserResponse,
)

router = APIRouter(
    prefix="/api/availability",
    tags=["Availability"],
)


@router.post(
    "",
    response_model=AvailabilityResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_availability(
    data: AvailabilityCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            connection.execute(
                text("""
                    SELECT id
                    FROM users
                    WHERE id = :teacher_id
                    FOR UPDATE
                """),
                {"teacher_id": current_user.id},
            ).scalar_one()

            if data.starts_at <= datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=422,
                    detail="Start time must be in the future",
                )

            overlapping_slot = connection.execute(
                text("""
                    SELECT id
                    FROM availability_slots
                    WHERE teacher_id = :teacher_id
                      AND starts_at < :ends_at
                      AND ends_at > :starts_at
                    LIMIT 1
                """),
                {
                    "teacher_id": current_user.id,
                    "starts_at": data.starts_at,
                    "ends_at": data.ends_at,
                },
            ).scalar_one_or_none()

            if overlapping_slot is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Availability overlaps an existing time slot",
                )

            row = connection.execute(
                text("""
                    INSERT INTO availability_slots (
                        teacher_id,
                        starts_at,
                        ends_at
                    )
                    VALUES (
                        :teacher_id,
                        :starts_at,
                        :ends_at
                    )
                    RETURNING
                        id,
                        teacher_id,
                        starts_at,
                        ends_at,
                        created_at
                """),
                {
                    "teacher_id": current_user.id,
                    "starts_at": data.starts_at,
                    "ends_at": data.ends_at,
                },
            ).mappings().one()

            result = AvailabilityResponse(**row)

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return result
@router.get("/me", response_model=list[AvailabilityResponse])
def list_my_availability(
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT
                        id,
                        teacher_id,
                        starts_at,
                        ends_at,
                        created_at
                    FROM availability_slots
                    WHERE teacher_id = :teacher_id
                    ORDER BY starts_at, id
                """),
                {"teacher_id": current_user.id},
            ).mappings().all()

            result = [
                AvailabilityResponse(**row)
                for row in rows
            ]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return result
@router.get(
    "/teachers/{teacher_id}",
    response_model=list[AvailabilityResponse],
)
def list_teacher_availability(
    teacher_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
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

            rows = connection.execute(
                text("""
                    SELECT
                        a.id,
                        a.teacher_id,
                        a.starts_at,
                        a.ends_at,
                        a.created_at
                    FROM availability_slots AS a
                    WHERE a.teacher_id = :teacher_id
                      AND a.starts_at > :now
                      AND NOT EXISTS (
                          SELECT 1
                          FROM booking_requests AS b
                          WHERE b.availability_slot_id = a.id
                            AND b.status = 'ACCEPTED'
                      )
                    ORDER BY a.starts_at, a.id
                """),
                {
                    "teacher_id": teacher_id,
                    "now": datetime.now(timezone.utc),
                },
            ).mappings().all()

            result = [
                AvailabilityResponse(**row)
                for row in rows
            ]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return result
@router.delete(
    "/{slot_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_availability(
    slot_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            slot = connection.execute(
                text("""
                    SELECT id
                    FROM availability_slots
                    WHERE id = :slot_id
                      AND teacher_id = :teacher_id
                    FOR UPDATE
                """),
                {
                    "slot_id": slot_id,
                    "teacher_id": current_user.id,
                },
            ).scalar_one_or_none()

            if slot is None:
                raise HTTPException(
                    status_code=404,
                    detail="Availability slot not found",
                )

            booking_exists = connection.execute(
                text("""
                    SELECT id
                    FROM booking_requests
                    WHERE availability_slot_id = :slot_id
                    LIMIT 1
                """),
                {"slot_id": slot_id},
            ).scalar_one_or_none()

            if booking_exists is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete a slot with booking requests",
                )

            connection.execute(
                text("""
                    DELETE FROM availability_slots
                    WHERE id = :slot_id
                      AND teacher_id = :teacher_id
                """),
                {
                    "slot_id": slot_id,
                    "teacher_id": current_user.id,
                },
            )

    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a slot with related records",
        ) from None

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return Response(status_code=status.HTTP_204_NO_CONTENT)