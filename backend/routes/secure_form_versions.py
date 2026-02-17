import json
from datetime import datetime

from flask import Blueprint, request, jsonify, g

from db import fetch_one, fetch_all, transaction, execute_in_tx, execute_no_return
from routes.middlewares import tenant_subscription_required

bp_secure_form_versions = Blueprint(
    "secure_form_versions",
    __name__,
    url_prefix="/api/secure/form-versions"
)


def _user_has_access_to_clinic(tenant_id: int, user_id: int, clinic_id: int) -> bool:
    row = fetch_one(
        """
        SELECT 1
          FROM clinic c
          JOIN user_clinic uc
            ON uc.clinic_id = c.clinic_id
           AND uc.tenant_id = c.tenant_id
           AND uc.user_id = %s
           AND uc.active_flag = 1
         WHERE c.tenant_id = %s
           AND c.clinic_id = %s
           AND c.deleted_at IS NULL
         LIMIT 1
        """,
        (user_id, tenant_id, clinic_id),
    )
    return row is not None


# -------------------------------------------------------
# LIST VERSIONS
# -------------------------------------------------------
@bp_secure_form_versions.get("")
@tenant_subscription_required
def list_versions():
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    id_form = request.args.get("id_form", type=int)
    clinic_id = request.args.get("clinic_id", type=int)

    if not id_form or not clinic_id:
        return jsonify({"error": "id_form and clinic_id are required"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    rows = fetch_all(
        """
        SELECT id_form_version, id_form, version_number, status,
               created_at, created_by, updated_at, updated_by
          FROM form_version
         WHERE tenant_id=%s
           AND id_form=%s
           AND deleted_at IS NULL
         ORDER BY version_number DESC
        """,
        (tenant_id, id_form),
    )

    return jsonify(rows)


# -------------------------------------------------------
# CREATE DRAFT VERSION
# -------------------------------------------------------
@bp_secure_form_versions.post("")
@tenant_subscription_required
def create_draft_version():
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    data = request.get_json(force=True) or {}

    id_form = data.get("id_form")
    clinic_id = data.get("clinic_id")
    schema_json = data.get("schema_json")

    if not id_form or not clinic_id or schema_json is None:
        return jsonify({"error": "id_form, clinic_id, schema_json are required"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, int(clinic_id)):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    # próxima versão
    row = fetch_one(
        """
        SELECT COALESCE(MAX(version_number), 0) AS max_version
          FROM form_version
         WHERE tenant_id=%s
           AND id_form=%s
           AND deleted_at IS NULL
        """,
        (tenant_id, id_form),
    )
    next_version = int(row["max_version"]) + 1

    schema_str = json.dumps(schema_json, ensure_ascii=False)

    with transaction() as (conn, cur):
        new_id = execute_in_tx(
            cur,
            """
            INSERT INTO form_version
              (tenant_id, id_form, version_number, status, schema_json,
               created_at, created_by)
            VALUES
              (%s, %s, %s, 'DRAFT', %s,
               NOW(), %s)
            """,
            (tenant_id, id_form, next_version, schema_str, user_id),
        )

    result = fetch_one(
        """
        SELECT id_form_version, id_form, version_number, status,
               created_at, created_by
          FROM form_version
         WHERE id_form_version=%s
        """,
        (new_id,),
    )

    return jsonify(result), 201


# -------------------------------------------------------
# PUBLISH VERSION
# -------------------------------------------------------
@bp_secure_form_versions.post("/<int:id_form_version>/publish")
@tenant_subscription_required
def publish_version(id_form_version: int):
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    row = fetch_one(
        """
        SELECT id_form_version, id_form
          FROM form_version
         WHERE id_form_version=%s
           AND tenant_id=%s
           AND deleted_at IS NULL
        """,
        (id_form_version, tenant_id),
    )

    if not row:
        return jsonify({"error": "form_version_not_found"}), 404

    id_form = row["id_form"]

    with transaction() as (conn, cur):
        # despublicar outras
        execute_in_tx(
            cur,
            """
            UPDATE form_version
               SET status='INACTIVE'
             WHERE tenant_id=%s
               AND id_form=%s
               AND deleted_at IS NULL
            """,
            (tenant_id, id_form),
        )

        # publicar esta
        execute_in_tx(
            cur,
            """
            UPDATE form_version
               SET status='PUBLISHED',
                   updated_at=NOW(),
                   updated_by=%s
             WHERE id_form_version=%s
               AND tenant_id=%s
               AND deleted_at IS NULL
            """,
            (user_id, id_form_version, tenant_id),
        )

    result = fetch_one(
        """
        SELECT id_form_version, id_form, version_number, status,
               updated_at, updated_by
          FROM form_version
         WHERE id_form_version=%s
        """,
        (id_form_version,),
    )

    return jsonify(result)
