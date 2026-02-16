from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g

from db import fetch_all, fetch_one, transaction, execute_in_tx
from routes.middlewares import tenant_subscription_required
from utils.security import hash_password, generate_numeric_code

bp_clinic_users = Blueprint("clinic_users", __name__, url_prefix="/api/clinic/users")


def _now():
    return datetime.utcnow()


def _require_clinic_id():
    clinic_id = request.args.get("clinic_id")
    if clinic_id:
        try:
            return int(clinic_id)
        except:
            return None

    data = request.get_json(silent=True) or {}
    clinic_id = data.get("clinic_id")
    if clinic_id:
        try:
            return int(clinic_id)
        except:
            return None

    return None


def _user_has_access(tenant_id, user_id, clinic_id):
    row = fetch_one(
        """
        SELECT 1
          FROM user_clinic
         WHERE tenant_id=%s
           AND clinic_id=%s
           AND user_id=%s
           AND active_flag=1
         LIMIT 1
        """,
        (tenant_id, clinic_id, user_id),
    )
    return row is not None


# -------------------------------------------------------
# LIST USERS OF CLINIC
# -------------------------------------------------------
@bp_clinic_users.get("")
@tenant_subscription_required
def list_users():
    tenant_id = g.user["tenant_id"]
    user_id = g.user["user_id"]

    clinic_id = _require_clinic_id()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400

    if not _user_has_access(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    users = fetch_all(
        """
        SELECT ua.user_id,
               ua.email,
               ua.phone,
               ua.email_verified,
               ua.status,
               uc.role_code,
               uc.active_flag,
               ua.created_at
          FROM user_account ua
          JOIN user_clinic uc
            ON uc.user_id = ua.user_id
           AND uc.tenant_id = ua.tenant_id
         WHERE ua.tenant_id=%s
           AND uc.clinic_id=%s
           AND ua.deleted_at IS NULL
         ORDER BY uc.role_code ASC, ua.email ASC
        """,
        (tenant_id, clinic_id),
    )

    return jsonify({"items": users})


# -------------------------------------------------------
# INVITE / CREATE CLINIC USER
# -------------------------------------------------------
@bp_clinic_users.post("/invite")
@tenant_subscription_required
def invite_user():
    tenant_id = g.user["tenant_id"]
    current_user_id = g.user["user_id"]

    data = request.get_json(force=True)

    clinic_id = data.get("clinic_id")
    email = data.get("email")
    role_code = data.get("role_code", "STAFF")

    if not clinic_id or not email:
        return jsonify({"error": "missing_fields"}), 400

    clinic_id = int(clinic_id)

    if role_code not in ("ADMIN", "PROFESSIONAL", "STAFF"):
        return jsonify({"error": "invalid_role"}), 400

    if not _user_has_access(tenant_id, current_user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    existing = fetch_one(
        """
        SELECT user_id FROM user_account
         WHERE email=%s AND deleted_at IS NULL
         LIMIT 1
        """,
        (email,),
    )

    now = _now()
    temp_password = generate_numeric_code(8)
    pwd_hash = hash_password(temp_password)

    with transaction() as (conn, cur):
        if existing:
            user_id = existing["user_id"]

            # If user exists but not linked to this clinic, link it
            link = fetch_one(
                """
                SELECT 1 FROM user_clinic
                 WHERE tenant_id=%s AND clinic_id=%s AND user_id=%s
                 LIMIT 1
                """,
                (tenant_id, clinic_id, user_id),
            )

            if not link:
                execute_in_tx(
                    cur,
                    """
                    INSERT INTO user_clinic
                      (tenant_id, user_id, clinic_id, role_code, active_flag, created_at)
                    VALUES (%s, %s, %s, %s, 1, %s)
                    """,
                    (tenant_id, user_id, clinic_id, role_code, now),
                )
        else:
            # Create new user_account
            user_id = execute_in_tx(
                cur,
                """
                INSERT INTO user_account
                  (user_type, tenant_id, email, email_verified,
                   password_hash, status, created_at)
                VALUES
                  ('CLINIC_STAFF', %s, %s, 0,
                   %s, 'ACTIVE', %s)
                """,
                (tenant_id, email, pwd_hash, now),
            )

            # Link to clinic
            execute_in_tx(
                cur,
                """
                INSERT INTO user_clinic
                  (tenant_id, user_id, clinic_id, role_code, active_flag, created_at)
                VALUES (%s, %s, %s, %s, 1, %s)
                """,
                (tenant_id, user_id, clinic_id, role_code, now),
            )

        # Create email verification
        code = generate_numeric_code(6)
        execute_in_tx(
            cur,
            """
            INSERT INTO contact_verification
              (user_id, purpose, target, code, status, expires_at, created_at)
            VALUES (%s, 'EMAIL_VERIFY', %s, %s, 'SENT', %s, %s)
            """,
            (user_id, email, code, now + timedelta(minutes=30), now),
        )

    return jsonify({
        "user_id": user_id,
        "temporary_password": temp_password,  # dev only
        "dev_email_code": code
    }), 201


# -------------------------------------------------------
# UPDATE ROLE OR ACTIVE FLAG
# -------------------------------------------------------
@bp_clinic_users.put("/<int:user_id>")
@tenant_subscription_required
def update_user(user_id):
    tenant_id = g.user["tenant_id"]
    current_user_id = g.user["user_id"]

    data = request.get_json(force=True)
    clinic_id = data.get("clinic_id")
    role_code = data.get("role_code")
    active_flag = data.get("active_flag")

    if not clinic_id:
        return jsonify({"error": "missing_clinic_id"}), 400

    clinic_id = int(clinic_id)

    if not _user_has_access(tenant_id, current_user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    fields = []
    params = []

    if role_code:
        if role_code not in ("ADMIN", "PROFESSIONAL", "STAFF"):
            return jsonify({"error": "invalid_role"}), 400
        fields.append("role_code=%s")
        params.append(role_code)

    if active_flag is not None:
        fields.append("active_flag=%s")
        params.append(int(active_flag))

    if not fields:
        return jsonify({"error": "no_fields_to_update"}), 400

    params.extend([tenant_id, clinic_id, user_id])

    sql = f"""
        UPDATE user_clinic
           SET {", ".join(fields)}
         WHERE tenant_id=%s
           AND clinic_id=%s
           AND user_id=%s
    """

    with transaction() as (conn, cur):
        execute_in_tx(cur, sql, tuple(params))

    return jsonify({"ok": True})


# -------------------------------------------------------
# REMOVE USER FROM CLINIC (soft disable)
# -------------------------------------------------------
@bp_clinic_users.delete("/<int:user_id>")
@tenant_subscription_required
def remove_user(user_id):
    tenant_id = g.user["tenant_id"]
    current_user_id = g.user["user_id"]

    clinic_id = _require_clinic_id()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400

    if not _user_has_access(tenant_id, current_user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    with transaction() as (conn, cur):
        execute_in_tx(
            cur,
            """
            UPDATE user_clinic
               SET active_flag=0
             WHERE tenant_id=%s
               AND clinic_id=%s
               AND user_id=%s
            """,
            (tenant_id, clinic_id, user_id),
        )

    return jsonify({"ok": True})
