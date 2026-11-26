import uuid

from django.conf import settings
from django.db import models


class TestSuite(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="test_suites")
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "name"], name="sf_test_suite_name_unique")]
        indexes = [models.Index(fields=["project", "updated_at"], name="sf_suite_project_updated_idx")]


class TestCase(models.Model):
    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        READY = "Ready", "Ready"
        DEPRECATED = "Deprecated", "Deprecated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="test_cases")
    suite = models.ForeignKey(TestSuite, on_delete=models.SET_NULL, null=True, blank=True, related_name="test_cases")
    requirement = models.ForeignKey("requirements.Requirement", on_delete=models.SET_NULL, null=True, blank=True, related_name="test_cases")
    code = models.CharField(max_length=64)
    title = models.CharField(max_length=240)
    preconditions = models.TextField(blank=True)
    steps = models.JSONField(default=list, blank=True)
    expected_result = models.TextField()
    priority = models.CharField(max_length=16, default="Medium")
    test_type = models.CharField(max_length=24, default="Functional")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    generated_by_ai = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="test_cases_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "code"], name="sf_test_case_project_code_unique")]
        indexes = [
            models.Index(fields=["project", "status"], name="sf_testcase_project_stat"),
            models.Index(fields=["requirement", "status"], name="sf_test_case_requirement_idx"),
        ]


class TestExecution(models.Model):
    class Result(models.TextChoices):
        PASSED = "Passed", "Passed"
        FAILED = "Failed", "Failed"
        BLOCKED = "Blocked", "Blocked"
        SKIPPED = "Skipped", "Skipped"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    test_case = models.ForeignKey(TestCase, on_delete=models.CASCADE, related_name="executions")
    result = models.CharField(max_length=12, choices=Result.choices)
    actual_result = models.TextField(blank=True)
    evidence = models.JSONField(default=list, blank=True)
    executed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="test_executions")
    executed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["test_case", "executed_at"], name="sf_execution_case_time_idx")]
