from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import engine
from .dependencies import get_current_user
from .schemas import BookingCreateRequest, BookingResponse, UserResponse

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
@router.get("/sent", response_model=list[BookingResponse])
def list_sent_bookings(
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT
                        id,
                        learner_id,
                        teacher_id,
                        skill_id,
                        availability_slot_id,
                        message,
                        status,
                        created_at,
                        updated_at
                    FROM booking_requests
                    WHERE learner_id = :learner_id
                    ORDER BY created_at DESC, id DESC
                """),
                {"learner_id": current_user.id},
            ).mappings().all()

            result = [
                BookingResponse(**row)
                for row in rows
            ]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return result
@router.get("/received", response_model=list[BookingResponse])
def list_received_bookings(
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT
                        id,
                        learner_id,
                        teacher_id,
                        skill_id,
                        availability_slot_id,
                        message,
                        status,
                        created_at,
                        updated_at
                    FROM booking_requests
                    WHERE teacher_id = :teacher_id
                    ORDER BY created_at DESC, id DESC
                """),
                {"teacher_id": current_user.id},
            ).mappings().all()

            result = [
                BookingResponse(**row)
                for row in rows
            ]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return result
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
                # Tạo buổi học tương ứng với booking đã nhận.
                connection.execute(
                    text("""
                        INSERT INTO sessions (booking_request_id)
                        VALUES (:booking_id)
                    """),
                    {"booking_id": booking_id},
                )

                # Những yêu cầu đang chờ khác ở cùng khung giờ
                # được từ chối vì lịch đã có người được nhận.
                connection.execute(
                    text("""
                        UPDATE booking_requests
                        SET status = 'REJECTED'
                        WHERE availability_slot_id = :slot_id
                          AND id <> :booking_id
                          AND status = 'PENDING'
                    """),
                    {
                        "slot_id": slot_id,
                        "booking_id": booking_id,
                    },
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