"""
Authentication dependency for Mandate Radar API.
Strictly verifies JWT Bearer token signature and expiry (60 min),
loading the user identity from the verified 'sub' claim.
Never trusts client-supplied identity parameters (user_id, email, phone).
"""
from fastapi import Header, HTTPException, status, Depends
from sqlalchemy.orm import Session
from typing import Optional

from app.core.db import get_db
from app.models.user import User
from app.services.auth_service import decode_access_token

def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """
    Enforces JWT authentication on protected routes.
    Decodes and verifies HS256 JWT, checks expiration, and retrieves user.
    Returns 401 on missing, tampered, expired, or invalid tokens.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing Bearer token in Authorization header.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please authenticate again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_id = str(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    
    # If not found directly by ID (e.g. transient / initial dev setup), check email claim
    if not user:
        email = payload.get("email")
        if email:
            user = db.query(User).filter(User.email == email).first()
            
    if not user:
        # Fallback create or reject
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user record not found. Please re-authenticate.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return user
