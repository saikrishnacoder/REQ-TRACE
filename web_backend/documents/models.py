import uuid

from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models


def project_document_path(instance, filename):
    return f"projects/{instance.project_id}/documents/{uuid.uuid4().hex}/{filename}"


class SourceDocument(models.Model):
    class Status(models.TextChoices):
        UPLOADED = "Uploaded", "Uploaded"
        PROCESSING = "Processing", "Processing"
        READY = "Ready", "Ready"
        FAILED = "Failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="documents")
    filename = models.CharField(max_length=255)
    file = models.FileField(upload_to=project_document_path, blank=True, validators=[FileExtensionValidator(["pdf", "docx", "txt", "md"])])
    media_type = models.CharField(max_length=120, blank=True)
    byte_size = models.PositiveBigIntegerField(default=0, validators=[MinValueValidator(0)])
    sha256 = models.CharField(max_length=64, blank=True)
    extracted_text = models.TextField(blank=True)
    extraction_status = models.CharField(max_length=16, choices=Status.choices, default=Status.UPLOADED)
    extraction_error = models.CharField(max_length=500, blank=True)
    created_by = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True, related_name="uploaded_specforge_documents")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["project", "created_at"], name="sf_doc_project_created_idx"),
            models.Index(fields=["project", "extraction_status"], name="sf_doc_project_status_idx"),
        ]
