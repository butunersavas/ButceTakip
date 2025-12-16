from app.main import app
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://172.17.1.72:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

__all__ = ["app"]
