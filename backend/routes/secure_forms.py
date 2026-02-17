import re
from datetime import datetime

from flask import Blueprint, request, jsonify, g

from db import fetch_one, fetch_all, transaction, execute_in_tx, execute_no_return
from routes.middlewares import tenant_subscription_required
from limits import check_limits, apply_usage_delta

bp_secure_forms = Blueprint("secure_forms", __name__, url_prefix="/api/secure/forms")


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "form"


def _generate_code(name: str) -> str:
    base = _slugify(name)
    suffix = datetime.utcnow().strftime("%y%m%d%H%M%S")
    code = f"{base}-{suffix}"
    return code[:60]


def _normalize_status(status: str) -> str:
    status = (status or "ACTIVE").upper().strip()
    if status not in ("ACTIVE", "INACTIVE"):
        status = "ACTIVE"
    return status


def _normalize_language(lang: str) -> str:
    lang = (lang or "").lower().strip()
    if lang.startswith("en"):
        return "en"
    return "pt"


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


@bp_secure_forms.get("")
@tenant_subscription_required
def secure_list_forms():
    """
    GET /api/secure/forms?clinic_id=...
    Lista forms do tenant do token.
    clinic_id é obrigatório apenas para validar acesso do usuário.
    """
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    clinic_id = request.args.get("clinic_id", type=int)
    if not clinic_id:
        return jsonify({"error": "clinic_id is required"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, int(clinic_id)):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    rows = fetch_all(
        """
        SELECT id_form, tenant_id, code, name, description, status, default_language, created_at, created_by, updated_at, updated_by
          FROM form
         WHERE tenant_id=%s
           AND deleted_at IS NULL
         ORDER BY id_form DESC
        """,
        (tenant_id,),
    )
    return jsonify(rows)


@bp_secure_forms.post("")
@tenant_subscription_required
def secure_create_form():
    """
    POST /api/secure/forms
    Body JSON:
      - clinic_id (obrigatório para validar acesso)
      - name (obrigatório)
      - description (opcional)
      - status (opcional: ACTIVE/INACTIVE)
      - default_language (opcional: pt/en)
      - code (opcional)
    """
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    data = request.get_json(force=True) or {}

    clinic_id = data.get("clinic_id")
    name = (data.get("name") or "").strip()
    description = data.get("description")
    status = _normalize_status(data.get("status"))
    default_language = _normalize_language(data.get("default_language") or "pt")

    if not clinic_id:
        return jsonify({"error": "clinic_id is required"}), 400
    if not name:
        return jsonify({"error": "name is required"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, int(clinic_id)):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    # ✅ limit forms
    ok, payload = check_limits(tenant_id, inc_forms=1)
    if not ok:
        return jsonify(payload), 402

    code = (data.get("code") or "").strip()
    if not code:
        code = _generate_code(name)

    with transaction() as (conn, cur):
        new_id = execute_in_tx(
            cur,
            """
            INSERT INTO form
              (tenant_id, code, name, description, status, default_language, created_at, created_by)
            VALUES
              (%s, %s, %s, %s, %s, %s, NOW(), %s)
            """,
            (tenant_id, code, name, description, status, default_language, user_id),
        )

    apply_usage_delta(tenant_id, inc_forms=1)

    row = fetch_one(
        """
        SELECT id_form, tenant_id, code, name, description, status, default_language, created_at, created_by
          FROM form
         WHERE id_form=%s AND tenant_id=%s AND deleted_at IS NULL
         LIMIT 1
        """,
        (int(new_id), tenant_id),
    )

    return jsonify(row), 201


@bp_secure_forms.put("/<int:id_form>")
@tenant_subscription_required
def secure_update_form(id_form: int):
    """
    PUT /api/secure/forms/<id_form>
    Body JSON:
      - clinic_id (obrigatório)
      - name (opcional)
      - description (opcional)
      - status (opcional)
      - default_language (opcional)
      - code (opcional)
    """
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    data = request.get_json(force=True) or {}
    clinic_id = data.get("clinic_id")

    if not clinic_id:
        return jsonify({"error": "clinic_id is required"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, int(clinic_id)):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    existing = fetch_one(
        """
        SELECT id_form
          FROM form
         WHERE id_form=%s AND tenant_id=%s AND deleted_at IS NULL
         LIMIT 1
        """,
        (id_form, tenant_id),
    )
    if not existing:
        return jsonify({"error": "form_not_found"}), 404

    name = data.get("name")
    description = data.get("description")
    status = data.get("status")
    default_language = data.get("default_language")
    code = data.get("code")

    updates = []
    params = []

    if name is not None:
        updates.append("name=%s")
        params.append((name or "").strip())

    if description is not None:
        updates.append("description=%s")
        params.append(description)

    if status is not None:
        updates.append("status=%s")
        params.append(_normalize_status(status))

    if default_language is not None:
        updates.append("default_language=%s")
        params.append(_normalize_language(default_language))

    if code is not None:
        updates.append("code=%s")
        params.append((code or "").strip() or _generate_code(name or "form"))

    updates.append("updated_at=NOW()")
    updates.append("updated_by=%s")
    params.append(user_id)

    if not updates:
        row = fetch_one(
            """
            SELECT id_form, tenant_id, code, name, description, status, default_language, created_at, created_by, updated_at, updated_by
              FROM form
             WHERE id_form=%s AND tenant_id=%s AND deleted_at IS NULL
             LIMIT 1
            """,
            (id_form, tenant_id),
        )
        return jsonify(row)

    sql = f"""
        UPDATE form
           SET {", ".join(updates)}
         WHERE id_form=%s AND tenant_id=%s AND deleted_at IS NULL
    """
    params.extend([id_form, tenant_id])

    execute_no_return(sql, tuple(params))

    row = fetch_one(
        """
        SELECT id_form, tenant_id, code, name, description, status, default_language, created_at, created_by, updated_at, updated_by
          FROM form
         WHERE id_form=%s AND tenant_id=%s AND deleted_at IS NULL
         LIMIT 1
        """,
        (id_form, tenant_id),
    )
    return jsonify(row)
