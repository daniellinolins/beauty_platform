from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify

from db import transaction, execute_in_tx, fetch_one
from utils.security import (
    hash_password,
    verify_password,
    create_jwt,
    generate_numeric_code,
)

bp_auth = Blueprint("auth", __name__, url_prefix="/api/auth")


def _now():
    return datetime.utcnow()


@bp_auth.post("/register-clinic")
def register_clinic():
    data = request.get_json(force=True)

    tenant_code = data.get("tenant_code")
    tenant_legal_name = data.get("tenant_legal_name")
    clinic_code = data.get("clinic_code")
    clinic_name = data.get("clinic_name")

    admin_email = data.get("email")
    admin_password = data.get("password")

    if not all([tenant_code, tenant_legal_name, clinic_code, clinic_name, admin_email, admin_password]):
        return jsonify({"error": "missing_fields"}), 400

    now = _now()
    trial_end = now + timedelta(days=30)

    pwd_hash = hash_password(admin_password)

    # Mantém compatível com o que você já rodou.
    # Recomendação futura: trocar por plan_code, mas por enquanto ok.
    # plan_id = int(data.get("plan_id", 1))
    plan_code = data.get("plan_code", "TRIAL_DEFAULT")
    plan = fetch_one(
        "SELECT plan_id FROM subscription_plan WHERE plan_code=%s AND deleted_at IS NULL LIMIT 1",
        (plan_code,),
    )
    if not plan:
        return jsonify({"error": "invalid_plan_code"}), 400
    plan_id = int(plan["plan_id"])


    with transaction() as (conn, cur):
        # 1) tenant
        tenant_id = execute_in_tx(
            cur,
            """
            INSERT INTO tenant (tenant_code, legal_name, status, created_at)
            VALUES (%s, %s, 'ACTIVE', %s)
            """,
            (tenant_code, tenant_legal_name, now),
        )

        # 2) clinic
        clinic_id = execute_in_tx(
            cur,
            """
            INSERT INTO clinic (tenant_id, clinic_code, name, status, created_at)
            VALUES (%s, %s, %s, 'ACTIVE', %s)
            """,
            (tenant_id, clinic_code, clinic_name, now),
        )

        # 3) user_account (TENANT_ADMIN)
        user_id = execute_in_tx(
            cur,
            """
            INSERT INTO user_account (user_type, tenant_id, email, email_verified, password_hash, status, created_at)
            VALUES ('TENANT_ADMIN', %s, %s, 0, %s, 'ACTIVE', %s)
            """,
            (tenant_id, admin_email, pwd_hash, now),
        )

        # 4) user_clinic (ADMIN)
        # ✅ FIX: inclui tenant_id para satisfazer FK fk_uc_tenant
        execute_in_tx(
            cur,
            """
            INSERT INTO user_clinic (tenant_id, user_id, clinic_id, role_code, active_flag, created_at)
            VALUES (%s, %s, %s, 'ADMIN', 1, %s)
            """,
            (tenant_id, user_id, clinic_id, now),
        )

        # 5) tenant_subscription (TRIAL)
        execute_in_tx(
            cur,
            """
            INSERT INTO tenant_subscription (tenant_id, plan_id, status, trial_start_at, trial_end_at, created_at)
            VALUES (%s, %s, 'TRIAL', %s, %s, %s)
            """,
            (tenant_id, plan_id, now, trial_end, now),
        )

        # 6) verification email
        code = generate_numeric_code(6)
        execute_in_tx(
            cur,
            """
            INSERT INTO contact_verification (user_id, purpose, target, code, status, expires_at, created_at)
            VALUES (%s, 'EMAIL_VERIFY', %s, %s, 'SENT', %s, %s)
            """,
            (user_id, admin_email, code, now + timedelta(minutes=30), now),
        )

    # Em produção: enviar email real. Em dev: retornar código.
    return jsonify(
        {
            "tenant_id": tenant_id,
            "clinic_id": clinic_id,
            "user_id": user_id,
            "email_verification_required": True,
            "dev_email_code": code,
        }
    ), 201


@bp_auth.post("/register-client")
def register_client():
    data = request.get_json(force=True)

    email = data.get("email")
    phone = data.get("phone")
    password = data.get("password")
    full_name = data.get("full_name")

    if not full_name or not password or not email:
        return jsonify({"error": "missing_fields"}), 400

    now = _now()
    pwd_hash = hash_password(password)

    with transaction() as (conn, cur):
        # client
        client_id = execute_in_tx(
            cur,
            """
            INSERT INTO client (full_name, email, phone, status, created_at)
            VALUES (%s, %s, %s, 'ACTIVE', %s)
            """,
            (full_name, email, phone, now),
        )

        # user_account
        user_id = execute_in_tx(
            cur,
            """
            INSERT INTO user_account (user_type, tenant_id, client_id, email, phone, email_verified, phone_verified, password_hash, status, created_at)
            VALUES ('CLIENT', NULL, %s, %s, %s, 0, 0, %s, 'ACTIVE', %s)
            """,
            (client_id, email, phone, pwd_hash, now),
        )

        # email verification (não bloqueia login do CLIENT por enquanto)
        code = generate_numeric_code(6)
        execute_in_tx(
            cur,
            """
            INSERT INTO contact_verification (user_id, purpose, target, code, status, expires_at, created_at)
            VALUES (%s, 'EMAIL_VERIFY', %s, %s, 'SENT', %s, %s)
            """,
            (user_id, email, code, now + timedelta(minutes=30), now),
        )

    return jsonify({"user_id": user_id, "client_id": client_id, "dev_email_code": code}), 201


@bp_auth.post("/login")
def login():
    data = request.get_json(force=True)
    email_or_phone = data.get("email_or_phone")
    password = data.get("password")

    if not email_or_phone or not password:
        return jsonify({"error": "missing_credentials"}), 400

    user = fetch_one(
        """
        SELECT user_id, user_type, tenant_id, client_id,
               email, phone, email_verified, password_hash, status
          FROM user_account
         WHERE deleted_at IS NULL
           AND (email = %s OR phone = %s)
         LIMIT 1
        """,
        (email_or_phone, email_or_phone),
    )

    if not user or user["status"] != "ACTIVE":
        return jsonify({"error": "invalid_credentials"}), 401

    if not verify_password(password, user["password_hash"]):
        return jsonify({"error": "invalid_credentials"}), 401

    # ✅ regra do requisito: login de clínica exige email verificado
    if user["user_type"] != "CLIENT" and int(user["email_verified"] or 0) != 1:
        return jsonify({"error": "email_not_verified"}), 403

    token = create_jwt(
        {
            "user_id": user["user_id"],
            "user_type": user["user_type"],
            "tenant_id": user["tenant_id"],
            "client_id": user["client_id"],
        }
    )

    return jsonify(
        {
            "token": token,
            "user": {
                "user_id": user["user_id"],
                "user_type": user["user_type"],
                "tenant_id": user["tenant_id"],
                "client_id": user["client_id"],
                "email": user["email"],
                "phone": user["phone"],
                "email_verified": user["email_verified"],
            },
        }
    )


@bp_auth.post("/verify")
def verify_contact():
    data = request.get_json(force=True)
    code = data.get("code")
    if not code:
        return jsonify({"error": "missing_code"}), 400

    now = _now()

    with transaction() as (conn, cur):
        ver = fetch_one(
            """
            SELECT verification_id, user_id, purpose, target, status, expires_at
              FROM contact_verification
             WHERE code = %s
             LIMIT 1
            """,
            (code,),
        )

        if not ver:
            return jsonify({"error": "invalid_code"}), 400
        if ver["status"] != "SENT":
            return jsonify({"error": "code_already_used_or_invalid"}), 400
        if ver["expires_at"] and now > ver["expires_at"]:
            execute_in_tx(
                cur,
                "UPDATE contact_verification SET status='EXPIRED' WHERE verification_id=%s",
                (ver["verification_id"],),
            )
            return jsonify({"error": "code_expired"}), 400

        execute_in_tx(
            cur,
            """
            UPDATE contact_verification
               SET status='USED', used_at=%s
             WHERE verification_id=%s
            """,
            (now, ver["verification_id"]),
        )

        if ver["purpose"] == "EMAIL_VERIFY":
            execute_in_tx(cur, "UPDATE user_account SET email_verified=1 WHERE user_id=%s", (ver["user_id"],))
        elif ver["purpose"] == "PHONE_VERIFY":
            execute_in_tx(cur, "UPDATE user_account SET phone_verified=1 WHERE user_id=%s", (ver["user_id"],))

    return jsonify({"ok": True})
