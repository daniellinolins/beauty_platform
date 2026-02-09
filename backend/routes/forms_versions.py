from flask import Blueprint, request, jsonify
from db import fetch_one, fetch_all, execute
import json

bp_forms_versions = Blueprint("forms_versions", __name__)


@bp_forms_versions.get("/api/forms/<int:idForm>/versions")
def list_form_versions(idForm: int):
    tenant_id = request.args.get("tenant_id", type=int) or 1

    form_row = fetch_one(
        """
        SELECT id_form
        FROM form
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        LIMIT 1
        """,
        {"tenant_id": tenant_id, "id_form": idForm},
    )
    if not form_row:
        return jsonify({"message": "Form not found"}), 404

    rows = fetch_all(
        """
        SELECT id_form_version, id_form, version_number, status, schema_json
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        ORDER BY version_number DESC
        """,
        {"tenant_id": tenant_id, "id_form": idForm},
    )

    for r in rows:
        try:
            if r.get("schema_json") and isinstance(r["schema_json"], str):
                r["schema_json"] = json.loads(r["schema_json"])
        except Exception:
            pass

    return jsonify(rows), 200


@bp_forms_versions.post("/api/forms/<int:idForm>/versions")
def create_form_version(idForm: int):
    data = request.get_json(silent=True) or {}

    tenant_id = int(data.get("tenant_id") or 1)

    form_row = fetch_one(
        """
        SELECT id_form
        FROM form
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        LIMIT 1
        """,
        {"tenant_id": tenant_id, "id_form": idForm},
    )
    if not form_row:
        return jsonify({"message": "Form not found"}), 404

    schema_json = data.get("schema_json")
    if schema_json is None:
        return jsonify({"message": "schema_json is required"}), 400

    try:
        schema_json_str = json.dumps(schema_json, ensure_ascii=False)
    except Exception:
        return jsonify({"message": "schema_json must be valid JSON"}), 400

    status = (data.get("status") or "DRAFT").strip()

    last = fetch_one(
        """
        SELECT version_number
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        ORDER BY version_number DESC
        LIMIT 1
        """,
        {"tenant_id": tenant_id, "id_form": idForm},
    )

    next_version = 1
    if last and last.get("version_number") is not None:
        next_version = int(last["version_number"]) + 1

    new_id = execute(
        """
        INSERT INTO form_version (tenant_id, id_form, version_number, status, schema_json)
        VALUES (%(tenant_id)s, %(id_form)s, %(version_number)s, %(status)s, %(schema_json)s)
        """,
        {
            "tenant_id": tenant_id,
            "id_form": idForm,
            "version_number": next_version,
            "status": status,
            "schema_json": schema_json_str,
        },
    )

    return jsonify({
        "id_form_version": new_id,
        "tenant_id": tenant_id,
        "id_form": idForm,
        "version_number": next_version,
        "status": status,
        "schema_json": schema_json,
    }), 201
