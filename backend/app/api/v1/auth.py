"""
Authentication API Router (v1)
Secured Authentication System:
- Real Google Sign-in with google-auth ID token verification
- Real Firebase Phone Auth with firebase-admin token verification
- Email/Password with identity link checks and rate limiting
- Strict tenant identity (never trusts client email/user_id/phone)
- Blocked registration/direct-login for demo account arun.sharma@example.com
"""
import re
import os
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.db import get_db
from app.models.user import User
from app.models.account import Account
from app.services.auth_service import hash_password, verify_password, create_access_token, decode_access_token
from app.services.firebase_service import verify_firebase_id_token
from google.oauth2 import id_token
from google.auth.transport.requests import Request as GoogleRequest
from app.core.config import settings

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/auth", tags=["Authentication"])

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str

class LoginRequest(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None

class PhoneAuthRequest(BaseModel):
    id_token: Optional[str] = None
    idToken: Optional[str] = None
    full_name: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: str
    is_demo: bool = False

def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """Dependency that resolves the authenticated user strictly from the verified Bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token required"
        )
    
    token = authorization.split(" ")[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or has expired"
        )
    
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
def register_user(request: Request, req: RegisterRequest, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()

    # Phase 4: Block registration for demo account
    if clean_email == "arun.sharma@example.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo account arun.sharma@example.com cannot be registered. Use 'Explore sample data' to view demo mode."
        )

    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        if existing.password_hash == "GOOGLE_OAUTH_VERIFIED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email was registered using Google Sign-In. Please sign in with Google."
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User with this email already exists.")
    
    user = User(
        email=clean_email,
        full_name=req.full_name.strip(),
        password_hash=hash_password(req.password),
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    account = Account(
        user_id=user.id,
        account_type="SAVINGS",
        bank_name="Primary Bank",
        account_mask="**0000",
        currency="INR",
        virtual_balance=50000.0
    )
    db.add(account)
    db.commit()
    
    token = create_access_token({"sub": user.id, "email": user.email})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_demo=False
    )

@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login_user(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()

    # Phase 4: Block direct password login for demo account
    if clean_email == "arun.sharma@example.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Direct login for demo user arun.sharma@example.com is blocked. Please click 'Explore sample data' to view the demo."
        )

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email or password.")

    if user.password_hash == "GOOGLE_OAUTH_VERIFIED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account was registered with Google Sign-In. Please sign in with Google."
        )

    if not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email or password.")
    
    token = create_access_token({"sub": user.id, "email": user.email})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_demo=False
    )

@router.post("/google", response_model=TokenResponse)
def google_auth(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Authenticates user using Google ID token credential.
    Verifies token with Google OAuth, strictly requiring email_verified == True.
    Identity (email and name) is extracted ONLY from verified claims.
    Rejects raw email/name submissions with 401.
    """
    if not req.credential:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token credential is required. Raw email or unverified identity is rejected."
        )

    try:
        client_id = settings.GOOGLE_CLIENT_ID if settings.GOOGLE_CLIENT_ID else None
        id_info = id_token.verify_oauth2_token(req.credential, GoogleRequest(), client_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google authentication failed: Invalid or expired token credential ({str(e)})"
        )

    if not id_info.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified."
        )

    clean_email = str(id_info.get("email", "")).strip().lower()
    if not clean_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google profile: missing verified email claim."
        )

    # Phase 4: Block demo email login via Google
    if clean_email == "arun.sharma@example.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo account arun.sharma@example.com is reserved. Please use 'Explore sample data' to view demo mode."
        )

    display_name = str(id_info.get("name") or id_info.get("given_name") or clean_email.split("@")[0].title()).strip()

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        user = User(
            email=clean_email,
            full_name=display_name,
            password_hash="GOOGLE_OAUTH_VERIFIED",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        account = Account(
            user_id=user.id,
            account_type="SAVINGS",
            bank_name="Primary Bank",
            account_mask="**0000",
            currency="INR",
            virtual_balance=50000.0
        )
        db.add(account)
        db.commit()

    token = create_access_token({"sub": user.id, "email": user.email})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_demo=False
    )

@router.post("/phone", response_model=TokenResponse)
def phone_auth(req: PhoneAuthRequest, db: Session = Depends(get_db)):
    """
    Authenticates user using verified Firebase Phone Auth ID token.
    Extracts phone_number from verified claims. Never trusts client phone input.
    """
    token_str = req.id_token or req.idToken
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase ID token is required for phone verification."
        )

    try:
        decoded_claims = verify_firebase_id_token(token_str)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Firebase phone verification failed: Invalid or expired token ({str(e)})"
        )

    phone_number = decoded_claims.get("phone_number")
    if not phone_number:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase token does not contain a verified phone_number claim."
        )

    clean_digits = re.sub(r"\D", "", phone_number)
    phone_10 = clean_digits[-10:] if len(clean_digits) >= 10 else clean_digits

    phone_email = f"{phone_10}@phone.mandateradar.in"
    user = db.query(User).filter((User.phone == phone_number) | (User.email == phone_email)).first()

    display_name = (req.full_name or "").strip()
    if not display_name:
        display_name = f"User +91 {phone_10[-4:]}"

    if not user:
        user = User(
            email=phone_email,
            phone=phone_number,
            full_name=display_name,
            password_hash="FIREBASE_PHONE_VERIFIED",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        account = Account(
            user_id=user.id,
            account_type="SAVINGS",
            bank_name="Primary Bank",
            account_mask=f"**{phone_10[-4:]}",
            currency="INR",
            virtual_balance=25000.0
        )
        db.add(account)
        db.commit()
    else:
        if not user.phone:
            user.phone = phone_number
            db.commit()

    token = create_access_token({"sub": user.id, "email": user.email})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_demo=False
    )

@router.get("/me")
def get_profile(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "phone": user.phone,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat()
    }
