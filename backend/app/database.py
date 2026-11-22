import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL, create_engine, text

# Tìm file backend/.env dựa trên vị trí file Python này.
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path, interpolate=False)

# Kiểm tra cấu hình bắt buộc.
required_keys = [
    "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"
]
missing_keys = [
    key for key in required_keys if not os.getenv(key)
]

if missing_keys:
    raise RuntimeError(
        "Thieu cau hinh: " + ", ".join(missing_keys)
    )

# Tạo thông tin kết nối từ các giá trị trong .env.
database_url = URL.create(
    drivername="postgresql+psycopg",
    username=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    host=os.environ["DB_HOST"],
    port=int(os.environ["DB_PORT"]),
    database=os.environ["DB_NAME"],
)

engine = create_engine(
    database_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)

# Chỉ chạy phần kiểm tra khi mở trực tiếp file này.
if __name__ == "__main__":
    with engine.connect() as connection:
        database_name = connection.execute(
            text("SELECT current_database()")
        ).scalar_one()

        print(f"Ket noi thanh cong den database: {database_name}")