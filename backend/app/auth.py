from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import engine
from .schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from .security import (
    create_access_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest):
    password_hash = hash_password(data.password)

    try:
        with engine.begin() as connection:
            result = connection.execute(
                text("""
                    INSERT INTO users (email, full_name, password_hash)
                    VALUES (:email, :full_name, :password_hash)
                    RETURNING id, email, full_name, role
                """),
                {
                    "email": str(data.email),
                    "full_name": data.full_name,
                    "password_hash": password_hash,
                },
            )

            user = UserResponse(**result.mappings().one())

    except IntegrityError as exc:
        diagnostic = getattr(exc.orig, "diag", None)
        constraint_name = getattr(diagnostic, "constraint_name", None)

        if constraint_name == "uq_users_email_normalized":
            raise HTTPException(
                status_code=409,
                detail="Email already registered",
            ) from None

        raise HTTPException(
            status_code=500,
            detail="Unable to create account",
        ) from None

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return user
# Dùng bản băm mẫu để vẫn kiểm tra mật khẩu khi email không tồn tại.
DUMMY_PASSWORD_HASH = hash_password("DummyPasswordForTimingOnly!")


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    try:
        with engine.connect() as connection:
            user = connection.execute(
                text("""
                    SELECT id, password_hash
                    FROM users
                    WHERE lower(btrim(email)) = :email
                """),
                {"email": str(data.email)},
            ).mappings().one_or_none()

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    stored_hash = (
        user["password_hash"]
        if user is not None
        else DUMMY_PASSWORD_HASH
    )

    password_matches = verify_password(data.password, stored_hash)

    if user is None or not password_matches:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(
        access_token=create_access_token(user["id"]),
    )