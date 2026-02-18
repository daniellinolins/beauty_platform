from flask import Blueprint, request, jsonify
from db import fetch_all, fetch_one, execute, get_conn
import json
import hashlib
from datetime import datetime
import pymysql

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


def _schema_has_elements(schema_obj) -> bool:
    """
    Regra: precisa existir pelo menos 1 elemento no schema.
    Formato esperado no teu builder:
      { sections: [ { elements: [...] }, ... ] }
    """
    if not isinstance(schema_obj, dict):
        return False
    sections = schema_obj.get("sections") or []
    if not isinstance(sections, list):
        return False
    for s in sections:
        if not isinstance(s, dict):
            continue
        els = s.get("elements") or []
        if isinstance(els, list) and len(els) > 0:
            return True
    return False


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

    checksum = hashlib.sha256(schema_json.encode("utf-8")).hexdigest()

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
        draft_id = int(draft["id_form_version"])
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
                "id_form_version": draft_id,
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
            {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": draft_id},
        )
        return jsonify(row)

    # 3) Se não existe draft -> cria nova versão DRAFT
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

    row = fetch_one(
        """
        SELECT
          id_form_version, tenant_id, id_form, version_number, status,
          schema_json, publish_at, published_by, checksum_sha256,
          created_at, created_by, updated_at, updated_by
        FROM form_version
        WHERE id_form_version = %(id_form_version)s
        """,
        {"id_form_version": new_id},
    )
    return jsonify(row), 201


@bp_forms_versions.put("/<int:id_form>/versions/<int:id_form_version>")
def update_version(id_form: int, id_form_version: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    checksum = hashlib.sha256(schema_json.encode("utf-8")).hexdigest()

    execute(
        """
        UPDATE form_version
           SET schema_json=%(schema_json)s,
               checksum_sha256=%(checksum_sha256)s,
               updated_at=NOW()
         WHERE tenant_id=%(tenant_id)s
           AND id_form=%(id_form)s
           AND id_form_version=%(id_form_version)s
           AND deleted_at IS NULL
        """,
        {"schema_json": schema_json, "checksum_sha256": checksum, "tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )

    row = fetch_one(
        """
        SELECT
          id_form_version, tenant_id, id_form, version_number, status,
          schema_json, publish_at, published_by, checksum_sha256,
          created_at, created_by, updated_at, updated_by
        FROM form_version
        WHERE tenant_id=%(tenant_id)s
          AND id_form=%(id_form)s
          AND id_form_version=%(id_form_version)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )
    if not row:
        return jsonify({"error": "Version not found"}), 404
    return jsonify(row)


@bp_forms_versions.post("/<int:id_form>/versions/<int:id_form_version>/publish")
def publish_version(id_form: int, id_form_version: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    schema = data.get("schema_obj")
    if schema is None:
        schema_json = data.get("schema_json")
        if isinstance(schema_json, str):
            try:
                schema = json.loads(schema_json)
            except Exception:
                schema = None

    if not _schema_has_elements(schema):
        return jsonify({"error": "schema_must_have_elements"}), 400

    execute(
        """
        UPDATE form_version
           SET status='ARCHIVED', updated_at=NOW()
         WHERE tenant_id=%s AND id_form=%s AND status='PUBLISHED' AND deleted_at IS NULL
        """,
        (tenant_id, id_form),
    )

    execute(
        """
        UPDATE form_version
           SET status='PUBLISHED',
               publish_at=NOW(),
               updated_at=NOW()
         WHERE tenant_id=%s AND id_form=%s AND id_form_version=%s AND deleted_at IS NULL
        """,
        (tenant_id, id_form, id_form_version),
    )

    row = fetch_one(
        """
        SELECT id_form_version, tenant_id, id_form, version_number, status,
               schema_json, publish_at, published_by, checksum_sha256,
               created_at, created_by, updated_at, updated_by
          FROM form_version
         WHERE tenant_id=%s AND id_form=%s AND id_form_version=%s
        """,
        (tenant_id, id_form, id_form_version),
    )
    return jsonify(row)


# -----------------------------
# Secure endpoints (new)
# -----------------------------
from flask import g
from routes.middlewares import tenant_subscription_required

bp_secure_forms_versions = Blueprint("bp_secure_forms_versions", __name__, url_prefix="/api/secure/forms")


def _require_clinic_id_from_request():
    clinic_id = request.args.get("clinic_id")
    if clinic_id is not None:
        try:
            return int(clinic_id)
        except Exception:
            return None

    data = request.get_json(silent=True) or {}
    if "clinic_id" in data:
        try:
            return int(data.get("clinic_id"))
        except Exception:
            return None

    return None


def _user_has_access_to_clinic(tenant_id: int, user_id: int, clinic_id: int) -> bool:
    row = fetch_one(
        """
        SELECT 1
          FROM clinic c
          JOIN user_clinic uc
            ON uc.clinic_id = c.clinic_id
           AND uc.user_id = %s
           AND uc.tenant_id = c.tenant_id
           AND uc.active_flag = 1
         WHERE c.tenant_id = %s
           AND c.clinic_id = %s
           AND c.deleted_at IS NULL
         LIMIT 1
        """,
        (user_id, tenant_id, clinic_id),
    )
    return row is not None


def _ensure_form_belongs_to_tenant(tenant_id: int, id_form: int) -> bool:
    row = fetch_one(
        "SELECT 1 AS ok FROM form WHERE tenant_id=%s AND id_form=%s LIMIT 1",
        (tenant_id, id_form),
    )
    return row is not None


@bp_secure_forms_versions.get("/<int:id_form>/versions")
@tenant_subscription_required
def secure_list_versions(id_form: int):
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400
    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    if not _ensure_form_belongs_to_tenant(tenant_id, id_form):
        return jsonify({"error": "form_not_found"}), 404

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


@bp_secure_forms_versions.get("/<int:id_form>/versions/<int:id_form_version>")
@tenant_subscription_required
def secure_get_version(id_form: int, id_form_version: int):
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400
    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

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


@bp_secure_forms_versions.post("/<int:id_form>/versions")
@tenant_subscription_required
def secure_create_version(id_form: int):
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    data = request.get_json(silent=True) or {}

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400
    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    if not _ensure_form_belongs_to_tenant(tenant_id, id_form):
        return jsonify({"error": "form_not_found"}), 404

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    status = (data.get("status") or "DRAFT").upper()
    if status not in ("DRAFT", "PUBLISHED", "ARCHIVED"):
        status = "DRAFT"

    checksum = hashlib.sha256(schema_json.encode("utf-8")).hexdigest()

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


@bp_secure_forms_versions.post("/<int:id_form>/versions/draft")
@tenant_subscription_required
def secure_save_draft(id_form: int):
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    data = request.get_json(silent=True) or {}

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400
    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    if not _ensure_form_belongs_to_tenant(tenant_id, id_form):
        return jsonify({"error": "form_not_found"}), 404

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
        draft_id = int(draft["id_form_version"])
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
                "id_form_version": draft_id,
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
            {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": draft_id},
        )
        return jsonify(row)

    # 3) Se não existe draft -> cria nova versão DRAFT
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

    row = fetch_one(
        """
        SELECT
          id_form_version, tenant_id, id_form, version_number, status,
          schema_json, publish_at, published_by, checksum_sha256,
          created_at, created_by, updated_at, updated_by
        FROM form_version
        WHERE id_form_version = %(id_form_version)s
        """,
        {"id_form_version": new_id},
    )
    return jsonify(row), 201


@bp_secure_forms_versions.post("/<int:id_form>/versions/<int:id_form_version>/publish")
@tenant_subscription_required
def secure_publish_version(id_form: int, id_form_version: int):
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400
    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    v = fetch_one(
        """
        SELECT id_form_version
          FROM form_version
         WHERE tenant_id=%s AND id_form=%s AND id_form_version=%s AND deleted_at IS NULL
         LIMIT 1
        """,
        (tenant_id, id_form, id_form_version),
    )
    if not v:
        return jsonify({"error": "Version not found"}), 404

    execute(
        """
        UPDATE form_version
           SET status='ARCHIVED',
               updated_at=NOW()
         WHERE tenant_id=%s
           AND id_form=%s
           AND id_form_version<>%s
           AND status='PUBLISHED'
           AND deleted_at IS NULL
        """,
        (tenant_id, id_form, id_form_version),
    )

    execute(
        """
        UPDATE form_version
           SET status='PUBLISHED',
               publish_at=NOW(),
               published_by=%s,
               updated_at=NOW()
         WHERE tenant_id=%s
           AND id_form=%s
           AND id_form_version=%s
           AND deleted_at IS NULL
        """,
        (user_id, tenant_id, id_form, id_form_version),
    )

    row = fetch_one(
        """
        SELECT
          id_form_version, tenant_id, id_form, version_number, status,
          schema_json, publish_at, published_by, checksum_sha256,
          created_at, created_by, updated_at, updated_by
        FROM form_version
        WHERE tenant_id=%s AND id_form=%s AND id_form_version=%s
        """,
        (tenant_id, id_form, id_form_version),
    )

    return jsonify(row)
