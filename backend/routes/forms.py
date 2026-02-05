from flask import Blueprint, request, jsonify
from db import fetch_all, fetch_one

bp_forms = Blueprint("forms", __name__)

@bp_forms.get("/api/forms")
def list_forms():
    tenant_id = request.args.get("tenant_id", type=int)
    if not tenant_id:
        return jsonify({"message": "tenant_id is required"}), 400

    rows = fetch_all("""
        SELECT
          id_form, code, name, description, status, default_language
        FROM form
        WHERE tenant_id = %(tenant_id)s
          AND status = 'ACTIVE'
          AND deleted_at IS NULL
        ORDER BY name
    """, {"tenant_id": tenant_id})

    return jsonify(rows)

@bp_forms.get("/api/forms/<int:idForm>/versions/latest")
def get_latest_published_version(idForm: int):
    tenant_id = request.args.get("tenant_id", type=int)
    if not tenant_id:
        return jsonify({"message": "tenant_id is required"}), 400

    row = fetch_one("""
        SELECT
          id_form_version,
          version_number,
          status,
          schema_json
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND status = 'PUBLISHED'
          AND deleted_at IS NULL
        ORDER BY version_number DESC
        LIMIT 1
    """, {"tenant_id": tenant_id, "id_form": idForm})

    if not row:
        return jsonify({"message": "No published version found for this form"}), 404

    return jsonify(row)
