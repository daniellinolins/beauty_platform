from flask import Blueprint, request, jsonify
from db import fetch_all, fetch_one, execute
import json
from datetime import datetime

bp_forms_versions = Blueprint("bp_forms_versions", __name__, url_prefix="/api/forms")


def _as_int(v, default=None):
    try:
        return int(v)
    except Exception:
        return default


def _json_dumps_if_needed(value):
    # schema_json no DB é JSON (longtext com json_valid). Aceita dict/list ou string json.
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


@bp_forms_versions.get("/<int:id_form>/versions")
def list_versions(id_form: int):
    tenant_id = _as_int(request.args.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    rows = fetch_all(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        ORDER BY version_number DESC
        """,
        {"tenant_id": tenant_id, "id_form": id_form},
    )
    return jsonify(rows)


@bp_forms_versions.get("/<int:id_form>/versions/<int:id_form_version>")
def get_version(id_form: int, id_form_version: int):
    tenant_id = _as_int(request.args.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    row = fetch_one(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )

    if not row:
        return jsonify({"error": "Version not found"}), 404

    return jsonify(row)


@bp_forms_versions.post("/<int:id_form>/versions")
def create_version(id_form: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    status = (data.get("status") or "DRAFT").upper()
    if status not in ("DRAFT", "PUBLISHED", "ARCHIVED"):
        status = "DRAFT"

    # próximo version_number
    last = fetch_one(
        """
        SELECT MAX(version_number) AS max_version
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form},
    )
    next_version = (last.get("max_version") or 0) + 1 if last else 1

    new_id = execute(
        """
        INSERT INTO form_version
          (tenant_id, id_form, version_number, status, schema_json, created_at)
        VALUES
          (%(tenant_id)s, %(id_form)s, %(version_number)s, %(status)s, %(schema_json)s, NOW())
        """,
        {
            "tenant_id": tenant_id,
            "id_form": id_form,
            "version_number": next_version,
            "status": status,              # ✅ coluna correta
            "schema_json": schema_json,
        },
    )

    created = fetch_one(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE id_form_version = %(id_form_version)s
        """,
        {"id_form_version": new_id},
    )

    return jsonify(created), 201


@bp_forms_versions.put("/<int:id_form>/versions/<int:id_form_version>")
def update_version(id_form: int, id_form_version: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    existing = fetch_one(
        """
        SELECT id_form_version, status
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )
    if not existing:
        return jsonify({"error": "Version not found"}), 404

    # regra simples: só edita schema se estiver DRAFT
    if (existing.get("status") or "").upper() != "DRAFT":
        return jsonify({"error": "Only DRAFT versions can be updated"}), 409

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    execute(
        """
        UPDATE form_version
        SET schema_json = %(schema_json)s,
            updated_at = NOW()
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
        """,
        {
            "schema_json": schema_json,
            "tenant_id": tenant_id,
            "id_form": id_form,
            "id_form_version": id_form_version,
        },
    )

    row = fetch_one(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )
    return jsonify(row)


@bp_forms_versions.post("/<int:id_form>/versions/<int:id_form_version>/publish")
def publish_version(id_form: int, id_form_version: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    existing = fetch_one(
        """
        SELECT id_form_version, status
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )
    if not existing:
        return jsonify({"error": "Version not found"}), 404

    if (existing.get("status") or "").upper() != "DRAFT":
        return jsonify({"error": "Only DRAFT versions can be published"}), 409

    execute(
        """
        UPDATE form_version
        SET status = 'PUBLISHED',
            publish_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )

    row = fetch_one(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )
    return jsonify(row)
