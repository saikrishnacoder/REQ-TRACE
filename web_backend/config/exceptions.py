"""Consistent error envelope for Django REST Framework responses."""
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    detail = response.data
    message = detail.get("detail", "The request could not be completed") if isinstance(detail, dict) else "The request contains invalid data"
    response.data = {
        "error": {
            "status": response.status_code,
            "code": str(getattr(exc, "default_code", "request_error")),
            "message": str(message),
            "details": detail,
        }
    }
    return response
