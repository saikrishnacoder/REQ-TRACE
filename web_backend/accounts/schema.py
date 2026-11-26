from drf_spectacular.extensions import OpenApiAuthenticationExtension


class SessionTokenScheme(OpenApiAuthenticationExtension):
    target_class = "accounts.authentication.SessionTokenAuthentication"
    name = "sessionToken"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "opaque session token"}
