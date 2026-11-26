"""Keep unhandled API failures in the same safe JSON envelope as DRF errors."""
import logging

from django.http import HttpResponse, JsonResponse


logger = logging.getLogger("django.request")


def api_error(status: int, code: str, message: str) -> JsonResponse:
    return JsonResponse({
        "error": {"status": status, "code": code, "message": message, "details": None},
    }, status=status)


class ApiErrorMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        if request.path.startswith("/api/"):
            logger.error("Unhandled API exception", exc_info=(type(exception), exception, exception.__traceback__))
            return api_error(500, "internal_error", "An internal server error occurred")
        return None

    def process_response(self, request, response: HttpResponse):
        if request.path.startswith("/api/") and response.status_code == 404 and response.get("Content-Type", "").startswith("text/html"):
            return api_error(404, "not_found", "API endpoint not found")
        return response
