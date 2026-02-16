from datetime import datetime
from flask import Blueprint, request, jsonify, g

from db import fetch_all, fetch_one, transaction, execute_in_tx
from routes.middlewares import tenant_subscription_required

bp_services = Blueprint("services", __name__, url_prefix="/api/clinic/services")


def _now():
    return datetime.utcnow()


def _require_clinic_id_from_request():
    """
    We accept clinic_id from:
      - query string (GET)
      - JSON body (POST/PUT/DELETE)
    """
    clinic_id = request.args.get("clinic_id")

    if clinic_id:
        try:
            return int(clinic_id)
        except Exception:
            return None

    if request.method in ("POST", "PUT", "DELETE"):
        data = request.get_json(silent=True) or {}
        clinic_id = data.get("clinic_id")
        if clinic_id is None:
            return None
        try:
            return int(clinic_id)
        except Exception:
            return None

    return None


def _user_has_access_to_clinic(tenant_id: int, user_id: int, clinic_id: int) -> bool:
    """
    Enforce that:
      - clinic belongs to tenant
      - user belongs to that clinic via user_clinic (active_flag=1)
    TENANT_ADMIN should still have user_clinic rows to manage clinics.
    """
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


@bp_services.get("")
@tenant_subscription_required
def list_services():
    tenant_id = g.user["tenant_id"]
    user_id = g.user["user_id"]

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    items = fetch_all(
        """
        SELECT service_id, tenant_id, clinic_id,
               service_code, name, description, duration_min, price, active_flag,
               created_at, updated_at
          FROM service
         WHERE tenant_id = %s
           AND clinic_id = %s
           AND deleted_at IS NULL
         ORDER BY active_flag DESC, name ASC
        """,
        (tenant_id, clinic_id),
    )

    return jsonify({"items": items})


@bp_services.post("")
@tenant_subscription_required
def create_service():
    tenant_id = g.user["tenant_id"]
    user_id = g.user["user_id"]
    data = request.get_json(force=True)

    clinic_id = data.get("clinic_id")
    if clinic_id is None:
        return jsonify({"error": "missing_clinic_id"}), 400
    try:
        clinic_id = int(clinic_id)
    except Exception:
        return jsonify({"error": "invalid_clinic_id"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "missing_name"}), 400

    service_code = data.get("service_code")
    if service_code is not None:
        service_code = str(service_code).strip() or None

    description = data.get("description")
    if description is not None:
        description = str(description).strip() or None

    duration_min = data.get("duration_min")
    price = data.get("price")
    active_flag = data.get("active_flag", 1)

    now = _now()

    with transaction() as (conn, cur):
        service_id = execute_in_tx(
            cur,
            """
            INSERT INTO service
              (tenant_id, clinic_id, service_code, name, description, duration_min, price, active_flag,
               created_at, created_by)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s, %s,
               %s, %s)
            """,
            (
                tenant_id,
                clinic_id,
                service_code,
                name,
                description,
                duration_min,
                price,
                int(active_flag) if active_flag is not None else 1,
                now,
                user_id,
            ),
        )

    item = fetch_one(
        """
        SELECT service_id, tenant_id, clinic_id,
               service_code, name, description, duration_min, price, active_flag,
               created_at, updated_at
          FROM service
         WHERE service_id=%s
        """,
        (service_id,),
    )

    return jsonify({"item": item}), 201


@bp_services.put("/<int:service_id>")
@tenant_subscription_required
def update_service(service_id: int):
    tenant_id = g.user["tenant_id"]
    user_id = g.user["user_id"]
    data = request.get_json(force=True)

    clinic_id = data.get("clinic_id")
    if clinic_id is None:
        return jsonify({"error": "missing_clinic_id"}), 400
    try:
        clinic_id = int(clinic_id)
    except Exception:
        return jsonify({"error": "invalid_clinic_id"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    existing = fetch_one(
        """
        SELECT service_id
          FROM service
         WHERE service_id=%s
           AND tenant_id=%s
           AND clinic_id=%s
           AND deleted_at IS NULL
         LIMIT 1
        """,
        (service_id, tenant_id, clinic_id),
    )
    if not existing:
        return jsonify({"error": "service_not_found"}), 404

    # Only update provided fields
    fields = []
    params = []

    if "service_code" in data:
        val = data.get("service_code")
        val = (str(val).strip() if val is not None else None) or None
        fields.append("service_code=%s")
        params.append(val)

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "invalid_name"}), 400
        fields.append("name=%s")
        params.append(name)

    if "description" in data:
        val = data.get("description")
        val = (str(val).strip() if val is not None else None) or None
        fields.append("description=%s")
        params.append(val)

    if "duration_min" in data:
        fields.append("duration_min=%s")
        params.append(data.get("duration_min"))

    if "price" in data:
        fields.append("price=%s")
        params.append(data.get("price"))

    if "active_flag" in data:
        fields.append("active_flag=%s")
        params.append(int(data.get("active_flag") or 0))

    if not fields:
        return jsonify({"error": "no_fields_to_update"}), 400

    now = _now()
    fields.append("updated_at=%s")
    fields.append("updated_by=%s")
    params.extend([now, user_id])

    params.extend([service_id, tenant_id, clinic_id])

    sql = f"""
        UPDATE service
           SET {", ".join(fields)}
         WHERE service_id=%s
           AND tenant_id=%s
           AND clinic_id=%s
           AND deleted_at IS NULL
    """

    with transaction() as (conn, cur):
        execute_in_tx(cur, sql, tuple(params))

    item = fetch_one(
        """
        SELECT service_id, tenant_id, clinic_id,
               service_code, name, description, duration_min, price, active_flag,
               created_at, updated_at
          FROM service
         WHERE service_id=%s
        """,
        (service_id,),
    )

    return jsonify({"item": item})


@bp_services.delete("/<int:service_id>")
@tenant_subscription_required
def delete_service(service_id: int):
    tenant_id = g.user["tenant_id"]
    user_id = g.user["user_id"]

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    existing = fetch_one(
        """
        SELECT service_id
          FROM service
         WHERE service_id=%s
           AND tenant_id=%s
           AND clinic_id=%s
           AND deleted_at IS NULL
         LIMIT 1
        """,
        (service_id, tenant_id, clinic_id),
    )
    if not existing:
        return jsonify({"error": "service_not_found"}), 404

    now = _now()
    with transaction() as (conn, cur):
        execute_in_tx(
            cur,
            """
            UPDATE service
               SET deleted_at=%s, deleted_by=%s
             WHERE service_id=%s
               AND tenant_id=%s
               AND clinic_id=%s
               AND deleted_at IS NULL
            """,
            (now, user_id, service_id, tenant_id, clinic_id),
        )

    return jsonify({"ok": True})
