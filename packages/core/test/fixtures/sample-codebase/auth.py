"""
Authentication utilities
"""

import hashlib
import secrets
from datetime import datetime, timedelta


def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Hash a password with salt"""
    if salt is None:
        salt = secrets.token_hex(16)

    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return hashed.hex(), salt


def verify_password(password: str, hashed: str, salt: str) -> bool:
    """Verify a password against its hash"""
    new_hash, _ = hash_password(password, salt)
    return new_hash == hashed


def generate_token(user_id: str, expiry_hours: int = 24) -> dict:
    """Generate an authentication token"""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(hours=expiry_hours)

    return {
        'token': token,
        'user_id': user_id,
        'expires_at': expires_at.isoformat()
    }


class AuthService:
    """Service for managing authentication"""

    def __init__(self):
        self.sessions = {}

    def login(self, username: str, password: str) -> str | None:
        """Authenticate user and return token"""
        # Simplified for example
        if self._verify_credentials(username, password):
            token_data = generate_token(username)
            self.sessions[token_data['token']] = token_data
            return token_data['token']
        return None

    def logout(self, token: str) -> bool:
        """Invalidate a token"""
        if token in self.sessions:
            del self.sessions[token]
            return True
        return False

    def _verify_credentials(self, username: str, password: str) -> bool:
        """Verify user credentials (placeholder)"""
        return True
