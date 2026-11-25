from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class GoogleSignIn(BaseModel):
    credential: str = Field(min_length=20, max_length=8192)


class EmailStart(BaseModel):
    email: EmailStr


class EmailVerify(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    avatarUrl: str | None
    createdAt: datetime


class AuthConfig(BaseModel):
    googleClientId: str | None
    googleEnabled: bool
    emailEnabled: bool
    devMailer: bool
