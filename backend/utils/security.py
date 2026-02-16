import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from werkzeug.security import generate_password_hash, check_password_hash

JWT_SECRET = os.getenv("JWT_SECRET", os.getenv("SECRET_KEY", "dev-secret"))
JWT_ALG = "HS256"


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, password)


def create_jwt(payload: dict, minutes: int = 60 * 24 * 7) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=minutes)
    data = {**payload, "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALG)


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def generate_numeric_code(length: int = 6) -> str:
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def generate_token(length: int = 12) -> str:
    # URL-safe token (shortened)
    return secrets.token_urlsafe(length)[:length]
