import re

from fastapi import HTTPException, status

USERNAME_PATTERN = re.compile(r"^[a-zçğıöşü]+\.[a-zçğıöşü]+$")


def validate_username(username: str, is_admin: bool) -> None:
    username = username.strip()

    if is_admin:
        if username.lower() != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin kullanıcının kullanıcı adı sadece 'admin' olabilir.",
            )
        return

    username_lower = username.lower()

    if not USERNAME_PATTERN.match(username_lower):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Kullanıcı adı 'isim.soyisim' formatında olmalıdır (küçük harf, örn: savas.butuner)."
            ),
        )
