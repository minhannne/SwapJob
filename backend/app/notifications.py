from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError

from .database import engine
from .dependencies import get_current_user
from .schemas import UserResponse


router = APIRouter(
    prefix="/api/notifications",
    tags=["Notifications"],
)


class NotificationItem(BaseModel):
    id: int
    booking_request_id: int | None
    type: str
    message: str
    is_read: bool
    created_at: datetime
    actor_name: str | None
    skill_name: str | None


class NotificationUnreadState(BaseModel):
    has_unread: bool


class NotificationPage(NotificationUnreadState):
    items: list[NotificationItem]
    next_cursor: int | None


def create_booking_notification(
    connection: Connection,
    *,
    recipient_id: int,
    booking_id: int,
    notification_type: Literal[
        "BOOKING_REQUESTED",
        "BOOKING_ACCEPTED",
        "BOOKING_REJECTED",
    ],
):
    messages = {
        "BOOKING_REQUESTED": "You received a new booking request.",
        "BOOKING_ACCEPTED": "Your booking request was accepted.",
        "BOOKING_REJECTED": "Your booking request was rejected.",
    }

    connection.execute(
        text("""
            INSERT INTO notifications (
                recipient_id,
                booking_request_id,
                type,
                message,
                is_read
            )
            VALUES (
                :recipient_id,
                :booking_id,
                :notification_type,
                :message,
                FALSE
            )
        """),
        {
            "recipient_id": recipient_id,
            "booking_id": booking_id,
            "notification_type": notification_type,
            "message": messages[notification_type],
        },
    )


def _has_unread(connection: Connection, user_id: int) -> bool:
    return connection.execute(
        text("""
            SELECT EXISTS (
                SELECT 1
                FROM notifications
                WHERE recipient_id = :user_id
                  AND is_read = FALSE
            )
        """),
        {"user_id": user_id},
    ).scalar_one()


@router.get("/unread", response_model=NotificationUnreadState)
def get_unread_state(
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            return NotificationUnreadState(
                has_unread=_has_unread(connection, current_user.id),
            )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None


@router.get("", response_model=NotificationPage)
def list_notifications(
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
            rows = connection.execute(
                text("""
                    SELECT
                        notification.id,
                        notification.booking_request_id,
                        notification.type,
                        notification.message,
                        notification.is_read,
                        notification.created_at,
                        actor.full_name AS actor_name,
                        skill.name AS skill_name
                    FROM notifications AS notification
                    LEFT JOIN booking_requests AS booking
                        ON booking.id = notification.booking_request_id
                    LEFT JOIN skills AS skill
                        ON skill.id = booking.skill_id
                    LEFT JOIN users AS actor ON actor.id = CASE
                        WHEN notification.type = 'BOOKING_REQUESTED'
                            THEN booking.learner_id
                        ELSE booking.teacher_id
                    END
                    WHERE notification.recipient_id = :user_id
                      AND (
                          CAST(:before_id AS bigint) IS NULL
                          OR notification.id < :before_id
                      )
                    ORDER BY notification.id DESC
                    LIMIT :limit
                """),
                {
                    "user_id": current_user.id,
                    "before_id": before_id,
                    "limit": page_size + 1,
                },
            ).mappings().all()

            items = [
                NotificationItem(**row)
                for row in rows[:page_size]
            ]

            return NotificationPage(
                items=items,
                next_cursor=items[-1].id if len(rows) > page_size else None,
                has_unread=_has_unread(connection, current_user.id),
            )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None


@router.post(
    "/read-all",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def mark_all_notifications_read(
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            connection.execute(
                text("""
                    UPDATE notifications
                    SET is_read = TRUE
                    WHERE recipient_id = :user_id
                      AND is_read = FALSE
                """),
                {"user_id": current_user.id},
            )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{notification_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def mark_notification_read(
    notification_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            updated_id = connection.execute(
                text("""
                    UPDATE notifications
                    SET is_read = TRUE
                    WHERE id = :notification_id
                      AND recipient_id = :user_id
                    RETURNING id
                """),
                {
                    "notification_id": notification_id,
                    "user_id": current_user.id,
                },
            ).scalar_one_or_none()

            if updated_id is None:
                raise HTTPException(
                    status_code=404,
                    detail="Notification not found",
                )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return Response(status_code=status.HTTP_204_NO_CONTENT)