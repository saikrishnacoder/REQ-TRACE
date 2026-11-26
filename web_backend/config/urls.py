from django.contrib import admin
from django.urls import path
from rest_framework.permissions import AllowAny
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from config.health import HealthView
from accounts.views import CurrentUserView, LoginView, LogoutView, RegisterView
import accounts.schema  # noqa: F401 - registers the OpenAPI bearer scheme extension
from projects.views import ArchiveProjectView, DuplicateProjectView, ProjectActivityView, ProjectDetailView, ProjectListCreateView, RestoreProjectView, WorkspaceListCreateView, WorkspaceMemberDetailView, WorkspaceMembersView
from application_generation.views import GeneratedFileReviewView, GenerationPlanDetailView, GenerationPlanListCreateView, GenerationPlanReviewView, GenerationReadinessView, GenerationRunDetailView, GenerationRunDownloadView, GenerationRunListCreateView
from django.urls import include
from rest_framework.routers import SimpleRouter
from engineering_api import ApprovalViewSet, BusinessAnalysisViewSet, BusinessObjectiveViewSet, DesignArtifactViewSet, PersonaViewSet, RelationshipViewSet, RequirementViewSet, SourceDocumentViewSet, StakeholderViewSet, TestCaseViewSet, TestExecutionViewSet, TestSuiteViewSet

engineering_router = SimpleRouter()
engineering_router.register("requirements", RequirementViewSet, basename="project-requirements")
engineering_router.register("documents", SourceDocumentViewSet, basename="project-documents")
engineering_router.register("design-artifacts", DesignArtifactViewSet, basename="project-design-artifacts")
engineering_router.register("business-analyses", BusinessAnalysisViewSet, basename="project-business-analyses")
engineering_router.register("business-objectives", BusinessObjectiveViewSet, basename="project-business-objectives")
engineering_router.register("stakeholders", StakeholderViewSet, basename="project-stakeholders")
engineering_router.register("personas", PersonaViewSet, basename="project-personas")
engineering_router.register("test-suites", TestSuiteViewSet, basename="project-test-suites")
engineering_router.register("test-cases", TestCaseViewSet, basename="project-test-cases")
engineering_router.register("test-executions", TestExecutionViewSet, basename="project-test-executions")
engineering_router.register("traceability-links", RelationshipViewSet, basename="project-traceability-links")
engineering_router.register("approvals", ApprovalViewSet, basename="project-approvals")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", HealthView.as_view(), name="health"),
    path("api/v1/auth/register/", RegisterView.as_view(), name="register"),
    path("api/v1/auth/login/", LoginView.as_view(), name="login"),
    path("api/v1/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/v1/auth/me/", CurrentUserView.as_view(), name="current-user"),
    path("api/v1/workspaces/", WorkspaceListCreateView.as_view(), name="workspaces"),
    path("api/v1/workspaces/<uuid:workspace_id>/members/", WorkspaceMembersView.as_view(), name="workspace-members"),
    path("api/v1/workspaces/<uuid:workspace_id>/members/<int:user_id>/", WorkspaceMemberDetailView.as_view(), name="workspace-member-detail"),
    path("api/v1/projects/", ProjectListCreateView.as_view(), name="projects"),
    path("api/v1/projects/<uuid:project_id>/", ProjectDetailView.as_view(), name="project-detail"),
    path("api/v1/projects/<uuid:project_id>/activity/", ProjectActivityView.as_view(), name="project-activity"),
    path("api/v1/projects/<uuid:project_id>/archive/", ArchiveProjectView.as_view(), name="project-archive"),
    path("api/v1/projects/<uuid:project_id>/restore/", RestoreProjectView.as_view(), name="project-restore"),
    path("api/v1/projects/<uuid:project_id>/duplicate/", DuplicateProjectView.as_view(), name="project-duplicate"),
    path("api/v1/projects/<uuid:project_id>/", include(engineering_router.urls)),
    path("api/v1/projects/<uuid:project_id>/generation/readiness/", GenerationReadinessView.as_view(), name="generation-readiness"),
    path("api/v1/projects/<uuid:project_id>/generation/plans/", GenerationPlanListCreateView.as_view(), name="generation-plans"),
    path("api/v1/generation/plans/<uuid:plan_id>/", GenerationPlanDetailView.as_view(), name="generation-plan-detail"),
    path("api/v1/generation/plans/<uuid:plan_id>/runs/", GenerationRunListCreateView.as_view(), name="generation-run-create"),
    path("api/v1/generation/plans/<uuid:plan_id>/<str:decision>/", GenerationPlanReviewView.as_view(), name="generation-plan-review"),
    path("api/v1/generation/runs/<uuid:run_id>/", GenerationRunDetailView.as_view(), name="generation-run-detail"),
    path("api/v1/generation/runs/<uuid:run_id>/download/", GenerationRunDownloadView.as_view(), name="generation-run-download"),
    path("api/v1/generation/files/<uuid:file_id>/review/", GeneratedFileReviewView.as_view(), name="generated-file-review"),
    path("api/schema/", SpectacularAPIView.as_view(permission_classes=[AllowAny], authentication_classes=[]), name="openapi-schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="openapi-schema", permission_classes=[AllowAny], authentication_classes=[]), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="openapi-schema", permission_classes=[AllowAny], authentication_classes=[]), name="redoc"),
]
