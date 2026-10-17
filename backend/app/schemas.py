from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Literal

class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=255)
    full_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128, repr=False)

    @field_validator("full_name", mode="before")
    @classmethod
    def trim_full_name(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).lower()


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=1, max_length=128, repr=False)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
class ProfileResponse(UserResponse):
    bio: str | None
    avatar_url: str | None


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=1, max_length=100)
    bio: str | None = Field(default=None, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=2048)

    @field_validator("full_name", mode="before")
    @classmethod
    def trim_full_name(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, value):
        if value is None:
            return None

        value = value.strip()

        if not value:
            return None
        

        from re import fullmatch
        if fullmatch(r"/api/avatars/[0-9a-f]{32}\.png", value):
            return value
        from urllib.parse import urlparse


        parsed = urlparse(value)

        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("Avatar URL must be an HTTP or HTTPS URL")

        return value
class SkillCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value


class SkillResponse(BaseModel):
    id: int
    name: str
    description: str | None


class UserSkillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skill_id: int = Field(gt=0, le=9223372036854775807)
    experience_level: Literal[
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED",
    ]


class UserSkillResponse(BaseModel):
    skill_id: int
    name: str
    description: str | None
    experience_level: Literal[
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED",
    ]
class UserSkillUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    experience_level: Literal[
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED",
    ]
class TeacherSearchResponse(BaseModel):
    user_id: int
    full_name: str
    bio: str | None
    avatar_url: str | None
    skill_id: int
    skill_name: str
    experience_level: Literal[
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED",
    ]
class TeacherProfileResponse(BaseModel):
    user_id: int
    full_name: str
    bio: str | None
    avatar_url: str | None
    skills: list[UserSkillResponse]