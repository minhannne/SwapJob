from fastapi import APIRouter, Depends, HTTPException, Path, Response, Query
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from .database import engine
from .dependencies import get_current_user
from .schemas import (
    ProfileResponse,
    ProfileUpdateRequest,
    UserResponse,
    UserSkillRequest,
    UserSkillResponse,
    UserSkillUpdateRequest,
    TeacherSearchResponse,
    TeacherProfileResponse,
)


router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/me", response_model=ProfileResponse)
def read_my_profile(
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text("""
                    SELECT id, email, full_name, role, bio, avatar_url
                    FROM users
                    WHERE id = :user_id
                """),
                {"user_id": current_user.id},
            ).mappings().one_or_none()

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    return ProfileResponse(**row)


@router.put("/me", response_model=ProfileResponse)
def update_my_profile(
    data: ProfileUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            row = connection.execute(
                text("""
                    UPDATE users
                    SET full_name = :full_name,
                        bio = :bio,
                        avatar_url = :avatar_url
                    WHERE id = :user_id
                    RETURNING id, email, full_name, role, bio, avatar_url
                """),
                {
                    "user_id": current_user.id,
                    "full_name": data.full_name,
                    "bio": data.bio,
                    "avatar_url": data.avatar_url,
                },
            ).mappings().one_or_none()

            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail="User not found",
                )

            profile = ProfileResponse(**row)

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return profile
@router.post(
    "/me/skills",
    response_model=UserSkillResponse,
    status_code=201,
)
def add_my_skill(
    data: UserSkillRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            skill = connection.execute(
                text("""
                    SELECT id, name, description
                    FROM skills
                    WHERE id = :skill_id
                """),
                {"skill_id": data.skill_id},
            ).mappings().one_or_none()

            if skill is None:
                raise HTTPException(
                    status_code=404,
                    detail="Skill not found",
                )

            connection.execute(
                text("""
                    INSERT INTO user_skills (
                        user_id, skill_id, experience_level
                    )
                    VALUES (
                        :user_id, :skill_id, :experience_level
                    )
                """),
                {
                    "user_id": current_user.id,
                    "skill_id": data.skill_id,
                    "experience_level": data.experience_level,
                },
            )

            response = UserSkillResponse(
                skill_id=skill["id"],
                name=skill["name"],
                description=skill["description"],
                experience_level=data.experience_level,
            )

    except IntegrityError as exc:
        diagnostic = getattr(exc.orig, "diag", None)
        constraint_name = getattr(diagnostic, "constraint_name", None)

        if constraint_name == "pk_user_skills":
            raise HTTPException(
                status_code=409,
                detail="You already teach this skill",
            ) from None

        if constraint_name == "fk_user_skills_skill":
            raise HTTPException(
                status_code=404,
                detail="Skill not found",
            ) from None

        raise HTTPException(
            status_code=500,
            detail="Unable to add teaching skill",
        ) from None

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return response
@router.get("/me/skills", response_model=list[UserSkillResponse])
def list_my_skills(
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT
                        s.id AS skill_id,
                        s.name,
                        s.description,
                        us.experience_level
                    FROM user_skills AS us
                    JOIN skills AS s ON s.id = us.skill_id
                    WHERE us.user_id = :user_id
                    ORDER BY s.name, s.id
                """),
                {"user_id": current_user.id},
            ).mappings().all()

            skills = [UserSkillResponse(**row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return skills
@router.put("/me/skills/{skill_id}", response_model=UserSkillResponse)
def update_my_skill(
    data: UserSkillUpdateRequest,
    skill_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            row = connection.execute(
                text("""
                    UPDATE user_skills AS us
                    SET experience_level = :experience_level
                    FROM skills AS s
                    WHERE us.skill_id = s.id
                      AND us.user_id = :user_id
                      AND us.skill_id = :skill_id
                    RETURNING
                        s.id AS skill_id,
                        s.name,
                        s.description,
                        us.experience_level
                """),
                {
                    "user_id": current_user.id,
                    "skill_id": skill_id,
                    "experience_level": data.experience_level,
                },
            ).mappings().one_or_none()

            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail="Teaching skill not found",
                )

            response = UserSkillResponse(**row)

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return response
@router.delete("/me/skills/{skill_id}", status_code=204)
def delete_my_skill(
    skill_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.begin() as connection:
            deleted_skill_id = connection.execute(
                text("""
                    DELETE FROM user_skills
                    WHERE user_id = :user_id
                      AND skill_id = :skill_id
                    RETURNING skill_id
                """),
                {
                    "user_id": current_user.id,
                    "skill_id": skill_id,
                },
            ).scalar_one_or_none()

            if deleted_skill_id is None:
                raise HTTPException(
                    status_code=404,
                    detail="Teaching skill not found",
                )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return Response(status_code=204)
@router.get("/search", response_model=list[TeacherSearchResponse])
def search_teachers(
    keyword: str = Query(min_length=1, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: UserResponse = Depends(get_current_user),
):
    keyword = keyword.strip()

    if not keyword:
        raise HTTPException(
            status_code=422,
            detail="Search keyword must not be blank",
        )

    escaped_keyword = (
        keyword.replace("!", "!!")
        .replace("%", "!%")
        .replace("_", "!_")
    )

    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT
                        u.id AS user_id,
                        u.full_name,
                        u.bio,
                        u.avatar_url,
                        s.id AS skill_id,
                        s.name AS skill_name,
                        us.experience_level
                    FROM user_skills AS us
                    JOIN users AS u ON u.id = us.user_id
                    JOIN skills AS s ON s.id = us.skill_id
                    WHERE s.name ILIKE :keyword ESCAPE '!'
                    ORDER BY u.full_name, u.id, s.name, s.id
                    LIMIT :limit OFFSET :offset
                """),
                {
                    "keyword": f"%{escaped_keyword}%",
                    "limit": limit,
                    "offset": offset,
                },
            ).mappings().all()

            results = [
                TeacherSearchResponse(**row)
                for row in rows
            ]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return results
@router.get(
    "/{user_id}/profile",
    response_model=TeacherProfileResponse,
)
def get_teacher_profile(
    user_id: int = Path(gt=0, le=9223372036854775807),
    current_user: UserResponse = Depends(get_current_user),
):
    try:
        with engine.connect() as connection:
            user = connection.execute(
                text("""
                    SELECT
                        id AS user_id,
                        full_name,
                        bio,
                        avatar_url
                    FROM users
                    WHERE id = :user_id
                """),
                {"user_id": user_id},
            ).mappings().one_or_none()

            if user is None:
                raise HTTPException(
                    status_code=404,
                    detail="User not found",
                )

            rows = connection.execute(
                text("""
                    SELECT
                        s.id AS skill_id,
                        s.name,
                        s.description,
                        us.experience_level
                    FROM user_skills AS us
                    JOIN skills AS s ON s.id = us.skill_id
                    WHERE us.user_id = :user_id
                    ORDER BY s.name, s.id
                """),
                {"user_id": user_id},
            ).mappings().all()

            profile = TeacherProfileResponse(
                **user,
                skills=[
                    UserSkillResponse(**row)
                    for row in rows
                ],
            )

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return profile