"""Service and database readiness endpoint."""
from django.db import connections
from django.db.utils import DatabaseError
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema


class HealthView(APIView):
    authentication_classes = []
    permission_classes = []

    @extend_schema(
        operation_id="health_check",
        summary="Check web API and database readiness",
        responses={200: OpenApiTypes.OBJECT, 503: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        database = connections["default"]
        try:
            with database.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except DatabaseError:
            return Response({"status": "unavailable", "service": "specforge-web", "database": "unavailable"}, status=503)
        return Response({
            "status": "ok",
            "service": "specforge-web",
            "database": database.vendor,
        })
