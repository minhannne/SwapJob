from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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