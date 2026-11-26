from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import AuthSession


class AccountAPITests(APITestCase):
    def test_registration_profile_login_and_revocable_session(self):
        payload = {
            "username": "test-account",
            "email": "person@example.test",
            "password": "M!XeD-Valid-Pass_531",
            "display_name": "Test Person",
        }
        registered = self.client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(registered.status_code, 201, registered.data)
        token = registered.data["token"]
        user = get_user_model().objects.get(username="test-account")
        session = AuthSession.objects.get(user=user)
        self.assertNotEqual(session.token_digest, token)
        self.assertGreater(session.expires_at, timezone.now() + timedelta(hours=11))

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        profile = self.client.get("/api/v1/auth/me/")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.data["email"], payload["email"])
        updated = self.client.patch("/api/v1/auth/me/", {"display_name": "Updated"}, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["display_name"], "Updated")

        self.assertEqual(self.client.post("/api/v1/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

    def test_login_rejects_invalid_credentials_and_password_too_short(self):
        user = get_user_model().objects.create_user(
            username="login-user", email="login@example.test", password="Another!Strong-Password99"
        )
        failed_login = self.client.post(
            "/api/v1/auth/login/", {"username": user.username, "password": "wrong"}, format="json"
        )
        self.assertEqual(failed_login.status_code, 401)
        rejected_registration = self.client.post(
            "/api/v1/auth/register/",
            {"username": "short-password", "email": "short@example.test", "password": "short"},
            format="json",
        )
        self.assertEqual(rejected_registration.status_code, 400)

    def test_expired_session_is_rejected(self):
        registered = self.client.post(
            "/api/v1/auth/register/",
            {"username": "expired", "email": "expired@example.test", "password": "M!XeD-Valid-Pass_531"},
            format="json",
        )
        session = AuthSession.objects.get(user__username="expired")
        session.expires_at = timezone.now() - timedelta(seconds=1)
        session.save(update_fields=["expires_at"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {registered.data['token']}")
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)
