import json

from rest_framework import serializers

from application_generation.models import GeneratedFile, GenerationPlan, GenerationRun


class GenerationPlanSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, allow_null=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True, allow_null=True)

    class Meta:
        model = GenerationPlan
        fields = [
            "id", "project", "version", "state", "source_hash", "source_snapshot", "plan",
            "created_by_username", "reviewed_by_username", "review_comment", "created_at", "reviewed_at",
        ]
        read_only_fields = fields


class ReviewPlanSerializer(serializers.Serializer):
    comment = serializers.CharField(max_length=4000, required=False, allow_blank=True)


class EditBlueprintSerializer(serializers.Serializer):
    blueprint = serializers.JSONField()

    def validate_blueprint(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Blueprint must be a JSON object.")
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > 250_000:
            raise serializers.ValidationError("Blueprint exceeds the 250 KB limit.")
        editable = {"application_overview", "analysis", "application_structure", "implementation_sequence", "clarification_questions"}
        if set(value) - editable:
            raise serializers.ValidationError("System-managed traceability and source fields cannot be edited.")
        if not value:
            raise serializers.ValidationError("Provide at least one blueprint section.")
        questions = value.get("clarification_questions")
        if questions is not None:
            if not isinstance(questions, list) or len(questions) > 200:
                raise serializers.ValidationError({"clarification_questions": "Provide a list of up to 200 clarification questions."})
            for index, question in enumerate(questions):
                if not isinstance(question, dict) or not str(question.get("topic", "")).strip() or not str(question.get("question", "")).strip():
                    raise serializers.ValidationError({"clarification_questions": f"Question {index + 1} needs a topic and question."})
                if len(str(question.get("resolution", ""))) > 4000:
                    raise serializers.ValidationError({"clarification_questions": f"Question {index + 1} resolution exceeds 4,000 characters."})
        return value


class GenerationRunRequestSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(max_length=128)


class GeneratedFileSerializer(serializers.ModelSerializer):
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True, allow_null=True)

    class Meta:
        model = GeneratedFile
        fields = ["id", "path", "content", "sha256", "requirement_ids", "summary", "review_state", "reviewed_by_username", "review_comment", "created_at", "reviewed_at"]
        read_only_fields = fields


class GenerationRunSerializer(serializers.ModelSerializer):
    files = GeneratedFileSerializer(many=True, read_only=True)

    class Meta:
        model = GenerationRun
        fields = ["id", "plan", "state", "provider", "model", "error_message", "created_at", "started_at", "finished_at", "files"]
        read_only_fields = fields


class ReviewGeneratedFileSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=[GeneratedFile.ReviewState.APPROVED, GeneratedFile.ReviewState.REJECTED])
    comment = serializers.CharField(max_length=4000, required=False, allow_blank=True)
