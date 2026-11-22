from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import engine
from .dependencies import get_current_user
from .schemas import SkillCreateRequest, SkillResponse


router = APIRouter(
    prefix="/api/skills",
    tags=["Skills"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[SkillResponse])
def list_skills():
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("""
                    SELECT id, name, description
                    FROM skills
                    ORDER BY name, id
                """),
            ).mappings().all()

            skills = [SkillResponse(**row) for row in rows]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return skills


@router.post(
    "",
    response_model=SkillResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_skill(data: SkillCreateRequest):
    try:
        with engine.begin() as connection:
            row = connection.execute(
                text("""
                    INSERT INTO skills (name, description)
                    VALUES (:name, :description)
                    RETURNING id, name, description
                """),
                {
                    "name": data.name,
                    "description": data.description,
                },
            ).mappings().one()

            skill = SkillResponse(**row)

    except IntegrityError as exc:
        diagnostic = getattr(exc.orig, "diag", None)
        constraint_name = getattr(diagnostic, "constraint_name", None)

        if constraint_name == "uq_skills_name_normalized":
            raise HTTPException(
                status_code=409,
                detail="Skill already exists",
            ) from None

        raise HTTPException(
            status_code=500,
            detail="Unable to create skill",
        ) from None

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database operation unavailable",
        ) from None

    return skill