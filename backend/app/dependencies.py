import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .database import engine
from .schemas import UserResponse
from .security import JWT_ALGORITHM, JWT_SECRET_KEY


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserResponse:
    unauthorized = HTTPException(
        status_code=401,
        detail="Invalid or expired access token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise unauthorized

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat"]},
        )

        user_id = int(payload["sub"])

        if not 1 <= user_id <= 9223372036854775807:
            raise ValueError("Invalid user ID")

    except (InvalidTokenError, ValueError, TypeError):
        raise unauthorized from None

    try:
        with engine.connect() as connection:
            user = connection.execute(
                text("""
                    SELECT id, email, full_name, role
                    FROM users
                    WHERE id = :user_id
                """),
                {"user_id": user_id},
            ).mappings().one_or_none()

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    if user is None:
        raise unauthorized

    return UserResponse(**user)