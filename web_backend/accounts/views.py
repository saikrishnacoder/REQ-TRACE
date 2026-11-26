import hashlib
import secrets
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import OpenApiResponse

from accounts.authentication import SessionTokenAuthentication
from accounts.models import AuthSession, UserProfile
from accounts.serializers import LoginSerializer, ProfileSerializer, RegistrationSerializer

User = get_user_model()
SESSION_LIFETIME = timedelta(hours=12)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=RegistrationSerializer, responses={201: dict})
    @transaction.atomic
    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.create_user(
            username=data["username"], email=data["email"], password=data["password"]
        )
        UserProfile.objects.create(user=user, display_name=data.get("display_name", ""))
        token, session = issue_session(user)
        return Response(
            {"token": token, "expires_at": session.expires_at, "user": user_data(user)},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(request=LoginSerializer, responses={200: dict, 401: dict})
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        credentials = serializer.validated_data
        user = authenticate(request, username=credentials["username"], password=credentials["password"])
        if user is None or not user.is_active:
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)
        token, session = issue_session(user)
        return Response({"token": token, "expires_at": session.expires_at, "user": user_data(user)})


class LogoutView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={204: OpenApiResponse(description="Session revoked")})
    def post(self, request):
        session = request.auth
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=ProfileSerializer)
    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(ProfileSerializer(profile).data)

    @extend_schema(request=ProfileSerializer, responses=ProfileSerializer)
    def patch(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = ProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


def issue_session(user):
    raw_token = secrets.token_urlsafe(32)
    session = AuthSession.objects.create(
        user=user,
        token_digest=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        expires_at=timezone.now() + SESSION_LIFETIME,
    )
    return raw_token, session


def user_data(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return {"id": user.pk, "username": user.username, "email": user.email, "display_name": profile.display_name}
