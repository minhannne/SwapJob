from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from .users import router as users_router
from .database import engine
from .auth import router as auth_router 
from .skills import router as skills_router
from fastapi.staticfiles import StaticFiles

from .avatars import AVATAR_DIRECTORY, router as avatars_router
app = FastAPI(title="SwapJob API")
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(skills_router)
app.include_router(avatars_router)

app.mount(
    "/api/avatars",
    StaticFiles(directory=str(AVATAR_DIRECTORY)),
    name="avatars",
)
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/db")
def database_health():
    try:
        with engine.connect() as connection:
            database_name = connection.execute(
                text("SELECT current_database()")
            ).scalar_one()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database connection unavailable",
        ) from None

    return {
        "status": "ok",
        "database": database_name,
    }