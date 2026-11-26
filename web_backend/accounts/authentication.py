import hashlib
import hmac

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from accounts.models import AuthSession


class SessionTokenAuthentication(BaseAuthentication):
    keyword = b"bearer"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts:
            return None
        if len(parts) != 2 or parts[0].lower() != self.keyword:
            raise AuthenticationFailed("Use a valid Bearer session token.")
        try:
            raw_token = parts[1].decode("ascii")
        except UnicodeDecodeError as exc:
            raise AuthenticationFailed("Invalid session token.") from exc

        digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        session = AuthSession.objects.select_related("user").filter(token_digest=digest).first()
        if (
            session is None
            or session.revoked_at is not None
            or session.expires_at <= timezone.now()
            or not session.user.is_active
            or not hmac.compare_digest(session.token_digest, digest)
        ):
            raise AuthenticationFailed("Session is invalid or expired.")
        return session.user, session

    def authenticate_header(self, request):
        return "Bearer"
