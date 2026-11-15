from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import engine
from .dependencies import get_current_user
from .notifications import create_booking_notification
from .schemas import (
    BookingCreateRequest,
    BookingHistoryPage,
    BookingListItem,
    BookingResponse,
    UserResponse,
)


router = APIRouter(
    prefix="/api/bookings",
    tags=["Bookings"],
)


@router.post(
    "",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_booking(
    data: BookingCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            slot = connection.execute(
                text("""
                    SELECT id, teacher_id, starts_at
                    FROM availability_slots
                    WHERE id = :slot_id
                    FOR UPDATE
                """),
                {"slot_id": data.availability_slot_id},
            ).mappings().one_or_none()

            if slot is None:
                raise HTTPException(
                    status_code=404,
                    detail="Availability slot not found",
                )

            if slot["teacher_id"] == current_user.id:
                raise HTTPException(
                    status_code=422,
                    detail="You cannot book your own time slot",
                )

            if slot["starts_at"] <= datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=409,
                    detail="This time slot has already started",
                )

            teacher_skill = connection.execute(
                text("""
                    SELECT skill_id
                    FROM user_skills
                    WHERE user_id = :teacher_id
                      AND skill_id = :skill_id
                    FOR KEY SHARE
                """),
                {
                    "teacher_id": slot["teacher_id"],
                    "skill_id": data.skill_id,
                },
            ).scalar_one_or_none()

            if teacher_skill is None:
                raise HTTPException(
                    status_code=422,
                    detail="This teacher does not teach the selected skill",
                )

            accepted_booking = connection.execute(
                text("""
                    SELECT id
                    FROM booking_requests
                    WHERE availability_slot_id = :slot_id
                      AND status = 'ACCEPTED'
                    LIMIT 1
                """),
                {"slot_id": slot["id"]},
            ).scalar_one_or_none()

            if accepted_booking is not None:
                raise HTTPException(
                    status_code=409,
                    detail="This time slot is already booked",
                )

            pending_booking = connection.execute(
                text("""
                    SELECT id
                    FROM booking_requests
                    WHERE availability_slot_id = :slot_id
                      AND learner_id = :learner_id
                      AND status = 'PENDING'
                    LIMIT 1
                """),
                {
                    "slot_id": slot["id"],
                    "learner_id": current_user.id,
                },
            ).scalar_one_or_none()

            if pending_booking is not None:
                raise HTTPException(
                    status_code=409,
                    detail="You already have a pending request for this slot",
                )

            row = connection.execute(
                text("""
                    INSERT INTO booking_requests (
                        learner_id,
                        teacher_id,
                        skill_id,
                        availability_slot_id,
                        message
                    )
                    VALUES (
                        :learner_id,
                        :teacher_id,
                        :skill_id,
                        :slot_id,
                        :message
                    )
                    RETURNING
                        id,
                        learner_id,
                        teacher_id,
                        skill_id,
                        availability_slot_id,
                        message,
                        status,
                        created_at,
                        updated_at
                """),
                {
                    "learner_id": current_user.id,
                    "teacher_id": slot["teacher_id"],
                    "skill_id": data.skill_id,
                    "slot_id": slot["id"],
                    "message": data.message,
                },
                  ).mappings().one()
            create_booking_notification(
                connection,
                recipient_id=slot["teacher_id"],
                booking_id=row["id"],
                notification_type="BOOKING_REQUESTED",
            )

            result = BookingResponse(**row)

    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Booking conflicts with related data",
        ) from None

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return result


def _list_bookings(
    user_id: int,
    direction: Literal["sent", "received"],
    *,
    pending_only: bool = False,
    before_id: int | None = None,
    limit: int | None = None,
) -> list[BookingListItem]:
    owner_column = "learner_id" if direction == "sent" else "teacher_id"

    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text(f"""
                    SELECT
                        booking.id,
                        booking.learner_id,
                        booking.teacher_id,
                        booking.skill_id,
                        booking.availability_slot_id,
                        booking.message,
                        booking.status,
                        booking.created_at,
                        booking.updated_at,
                        learner.full_name AS learner_name,
                        teacher.full_name AS teacher_name,
                        skill.name AS skill_name,
                        slot.starts_at AS slot_starts_at,
                        slot.ends_at AS slot_ends_at
                    FROM booking_requests AS booking
                    LEFT JOIN users AS learner ON learner.id = booking.learner_id
                    LEFT JOIN users AS teacher ON teacher.id = booking.teacher_id
                    LEFT JOIN skills AS skill ON skill.id = booking.skill_id
                    LEFT JOIN availability_slots AS slot
                        ON slot.id = booking.availability_slot_id
                    WHERE booking.{owner_column} = :user_id
                      AND (NOT :pending_only OR booking.status = 'PENDING')
                      AND (
                          CAST(:before_id AS bigint) IS NULL
                          OR (booking.created_at, booking.id) < (
                              SELECT boundary.created_at, boundary.id
                              FROM booking_requests AS boundary
                              WHERE boundary.id = :before_id
                                AND boundary.{owner_column} = :user_id
                          )
                      )
                    ORDER BY booking.created_at DESC, booking.id DESC
                    LIMIT :limit
                """),
                {
                    "user_id": user_id,
                    "pending_only": pending_only,
                    "before_id": before_id,
                    "limit": limit,
                },
            ).mappings().all()

            return [BookingListItem(**row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None


@router.get("/sent", response_model=list[BookingListItem])
def list_sent_bookings(
    current_user: UserResponse = Depends(get_current_user),
):
    return _list_bookings(current_user.id, "sent")


@router.get("/received", response_model=list[BookingListItem])
def list_received_bookings(
    current_user: UserResponse = Depends(get_current_user),
):
    return _list_bookings(current_user.id, "received")


@router.get("/history", response_model=BookingHistoryPage)
def list_booking_history(
    direction: Literal["sent", "received"],
    pending_only: bool = False,
    before_id: int | None = Query(default=None, gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    page_size = 10
    rows = _list_bookings(
        current_user.id,
        direction,
        pending_only=pending_only,
        before_id=before_id,
        limit=page_size + 1,
    )
    items = rows[:page_size]

    return BookingHistoryPage(
        items=items,
        next_cursor=items[-1].id if len(rows) > page_size else None,
    )


def _change_booking_status(
    booking_id: int,
    current_user: UserResponse,
    next_status: str,
):
    try:
        with engine.begin() as connection:
            # Tìm khung giờ của booking trước khi khóa dữ liệu.
            slot_id = connection.execute(
                text("""
                    SELECT availability_slot_id
                    FROM booking_requests
                    WHERE id = :booking_id
                """),
                {"booking_id": booking_id},
            ).scalar_one_or_none()

            if slot_id is None:
                raise HTTPException(
                    status_code=404,
                    detail="Booking not found",
                )

            # Khóa lịch trước, rồi khóa booking.
            # Thứ tự này giống API tạo booking để tránh xung đột.
            slot = connection.execute(
                text("""
                    SELECT id, starts_at
                    FROM availability_slots
                    WHERE id = :slot_id
                    FOR UPDATE
                """),
                {"slot_id": slot_id},
            ).mappings().one_or_none()

            if slot is None:
                raise HTTPException(
                    status_code=409,
                    detail="Availability slot is no longer available",
                )

            booking = connection.execute(
                text("""
                    SELECT *
                    FROM booking_requests
                    WHERE id = :booking_id
                    FOR UPDATE
                """),
                {"booking_id": booking_id},
            ).mappings().one_or_none()

            if booking is None:
                raise HTTPException(
                    status_code=404,
                    detail="Booking not found",
                )

            # Người học được hủy; người dạy được nhận hoặc từ chối.
            owner_id = (
                booking["learner_id"]
                if next_status == "CANCELLED"
                else booking["teacher_id"]
            )

            if owner_id != current_user.id:
                raise HTTPException(
                    status_code=403,
                    detail="You cannot perform this action on this booking",
                )

            if booking["status"] != "PENDING":
                raise HTTPException(
                    status_code=409,
                    detail="Only pending bookings can be changed",
                )

            if next_status == "ACCEPTED":
                if slot["starts_at"] <= datetime.now(timezone.utc):
                    raise HTTPException(
                        status_code=409,
                        detail="This time slot has already started",
                    )

                accepted_booking = connection.execute(
                    text("""
                        SELECT id
                        FROM booking_requests
                        WHERE availability_slot_id = :slot_id
                          AND status = 'ACCEPTED'
                        LIMIT 1
                    """),
                    {"slot_id": slot_id},
                ).scalar_one_or_none()

                if accepted_booking is not None:
                    raise HTTPException(
                        status_code=409,
                        detail="This time slot is already booked",
                    )

            row = connection.execute(
                text("""
                    UPDATE booking_requests
                    SET status = :next_status
                    WHERE id = :booking_id
                    RETURNING
                        id,
                        learner_id,
                        teacher_id,
                        skill_id,
                        availability_slot_id,
                        message,
                        status,
                        created_at,
                        updated_at
                """),
                {
                    "booking_id": booking_id,
                    "next_status": next_status,
                },
            ).mappings().one()
            if next_status == "ACCEPTED":
                connection.execute(
                    text("""
                        INSERT INTO sessions (booking_request_id)
                        VALUES (:booking_id)
                    """),
                    {"booking_id": booking_id},
                )

                rejected_requests = connection.execute(
                    text("""
                        UPDATE booking_requests
                        SET status = 'REJECTED'
                        WHERE availability_slot_id = :slot_id
                          AND id <> :booking_id
                          AND status = 'PENDING'
                        RETURNING id, learner_id
                    """),
                    {
                        "slot_id": slot_id,
                        "booking_id": booking_id,
                    },
                ).mappings().all()

                for rejected_request in rejected_requests:
                    create_booking_notification(
                        connection,
                        recipient_id=rejected_request["learner_id"],
                        booking_id=rejected_request["id"],
                        notification_type="BOOKING_REJECTED",
                    )

            if next_status in ("ACCEPTED", "REJECTED"):
                create_booking_notification(
                    connection,
                    recipient_id=booking["learner_id"],
                    booking_id=booking_id,
                    notification_type=(
                        "BOOKING_ACCEPTED"
                        if next_status == "ACCEPTED"
                        else "BOOKING_REJECTED"
                    ),
                )
            result = BookingResponse(**row)

    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Booking conflicts with related data",
        ) from None

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return result


@router.post("/{booking_id}/accept", response_model=BookingResponse)
def accept_booking(
    booking_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    return _change_booking_status(
        booking_id,
        current_user,
        "ACCEPTED",
    )


@router.post("/{booking_id}/reject", response_model=BookingResponse)
def reject_booking(
    booking_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    return _change_booking_status(
        booking_id,
        current_user,
        "REJECTED",
    )


@router.post("/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(
    booking_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    return _change_booking_status(
        booking_id,
        current_user,
        "CANCELLED",
    )
@router.get("/{booking_id}", response_model=BookingListItem)
def get_booking(
    booking_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text("""
                    SELECT
                        booking.id,
                        booking.learner_id,
                        booking.teacher_id,
                        booking.skill_id,
                        booking.availability_slot_id,
                        booking.message,
                        booking.status,
                        booking.created_at,
                        booking.updated_at,
                        learner.full_name AS learner_name,
                        teacher.full_name AS teacher_name,
                        skill.name AS skill_name,
                        slot.starts_at AS slot_starts_at,
                        slot.ends_at AS slot_ends_at
                    FROM booking_requests AS booking
                    LEFT JOIN users AS learner
                        ON learner.id = booking.learner_id
                    LEFT JOIN users AS teacher
                        ON teacher.id = booking.teacher_id
                    LEFT JOIN skills AS skill
                        ON skill.id = booking.skill_id
                    LEFT JOIN availability_slots AS slot
                        ON slot.id = booking.availability_slot_id
                    WHERE booking.id = :booking_id
                      AND (
                          booking.learner_id = :user_id
                          OR booking.teacher_id = :user_id
                      )
                """),
                {
                    "booking_id": booking_id,
                    "user_id": current_user.id,
                },
            ).mappings().one_or_none()

            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail="Booking not found",
                )

            return BookingListItem(**row)

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None
