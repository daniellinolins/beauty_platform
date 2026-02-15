from flask import Blueprint, request, jsonify
from db import fetch_all, fetch_one, execute
import json
import hashlib
from datetime import datetime

bp_forms_versions = Blueprint("bp_forms_versions", __name__, url_prefix="/api/forms")


def _as_int(v, default=None):
    try:
        return int(v)
    except Exception:
        return default


def _json_dumps_if_needed(value):
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

    checksum = hashlib.sha256(schema_json.encode('utf-8')).hexdigest()

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
          (tenant_id, id_form, version_number, status, schema_json, checksum_sha256, created_at, updated_at)
        VALUES
          (%(tenant_id)s, %(id_form)s, %(version_number)s, %(status)s, %(schema_json)s, %(checksum_sha256)s, NOW(), NOW())
        """,
        {
            "tenant_id": tenant_id,
            "id_form": id_form,
            "version_number": next_version,
            "status": status,
            "schema_json": schema_json,
            "checksum_sha256": checksum,
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


@bp_forms_versions.post("/<int:id_form>/versions/draft")
def save_draft(id_form: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    checksum = hashlib.sha256(schema_json.encode("utf-8")).hexdigest()
    version_id = _as_int(data.get("version_id"))

    # 1) Se veio version_id e é DRAFT -> atualiza
    if version_id:
        existing = fetch_one(
            """
            SELECT id_form_version, status
            FROM form_version
            WHERE tenant_id = %(tenant_id)s
              AND id_form = %(id_form)s
              AND id_form_version = %(id_form_version)s
              AND deleted_at IS NULL
            """,
            {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": version_id},
        )
        if existing and (existing.get("status") or "").upper() == "DRAFT":
            execute(
                """
                UPDATE form_version
                SET schema_json = %(schema_json)s,
                    checksum_sha256 = %(checksum_sha256)s,
                    updated_at = NOW()
                WHERE tenant_id = %(tenant_id)s
                  AND id_form = %(id_form)s
                  AND id_form_version = %(id_form_version)s
                  AND status = 'DRAFT'
                """,
                {
                    "schema_json": schema_json,
                    "checksum_sha256": checksum,
                    "tenant_id": tenant_id,
                    "id_form": id_form,
                    "id_form_version": version_id,
                },
            )
            row = fetch_one(
                """
                SELECT
                  id_form_version, tenant_id, id_form, version_number, status,
                  schema_json, publish_at, published_by, checksum_sha256,
                  created_at, created_by, updated_at, updated_by
                FROM form_version
                WHERE tenant_id = %(tenant_id)s
                  AND id_form = %(id_form)s
                  AND id_form_version = %(id_form_version)s
                """,
                {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": version_id},
            )
            return jsonify(row)

    # 2) Tenta atualizar o draft mais recente
    draft = fetch_one(
        """
        SELECT id_form_version
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND status = 'DRAFT'
          AND deleted_at IS NULL
        ORDER BY version_number DESC
        LIMIT 1
        """,
        {"tenant_id": tenant_id, "id_form": id_form},
    )

    if draft:
        execute(
            """
            UPDATE form_version
            SET schema_json = %(schema_json)s,
                checksum_sha256 = %(checksum_sha256)s,
                updated_at = NOW()
            WHERE tenant_id = %(tenant_id)s
              AND id_form = %(id_form)s
              AND id_form_version = %(id_form_version)s
              AND status = 'DRAFT'
            """,
            {
                "schema_json": schema_json,
                "checksum_sha256": checksum,
                "tenant_id": tenant_id,
                "id_form": id_form,
                "id_form_version": draft["id_form_version"],
            },
        )

        row = fetch_one(
            """
            SELECT
              id_form_version, tenant_id, id_form, version_number, status,
              schema_json, publish_at, published_by, checksum_sha256,
              created_at, created_by, updated_at, updated_by
            FROM form_version
            WHERE tenant_id = %(tenant_id)s
              AND id_form = %(id_form)s
              AND id_form_version = %(id_form_version)s
            """,
            {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": draft["id_form_version"]},
        )
        return jsonify(row)

    # 3) Cria novo DRAFT
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
          (tenant_id, id_form, version_number, status, schema_json, checksum_sha256, created_at, updated_at)
        VALUES
          (%(tenant_id)s, %(id_form)s, %(version_number)s, 'DRAFT', %(schema_json)s, %(checksum_sha256)s, NOW(), NOW())
        """,
        {
            "tenant_id": tenant_id,
            "id_form": id_form,
            "version_number": next_version,
            "schema_json": schema_json,
            "checksum_sha256": checksum,
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

    if (existing.get("status") or "").upper() != "DRAFT":
        return jsonify({"error": "Only DRAFT versions can be updated"}), 409

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    checksum = hashlib.sha256(schema_json.encode('utf-8')).hexdigest()

    execute(
        """
        UPDATE form_version
        SET schema_json = %(schema_json)s,
            checksum_sha256 = %(checksum_sha256)s,
            updated_at = NOW()
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
        """,
        {
            "schema_json": schema_json,
            "checksum_sha256": checksum,
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
