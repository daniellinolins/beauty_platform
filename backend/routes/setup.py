from datetime import datetime, timedelta
import os

from flask import Blueprint, request, jsonify

from db import transaction, execute_in_tx
from utils.security import hash_password, generate_numeric_code


bp_setup = Blueprint("setup", __name__, url_prefix="/api/setup")


def _utcnow():
    return datetime.utcnow()


def _setup_allowed() -> bool:
    """
    Se SETUP_SECRET estiver definido no ambiente, exige header X-Setup-Secret.
    Em dev, você pode não setar SETUP_SECRET e ele fica aberto.
    """
    secret = os.getenv("SETUP_SECRET")
    if not secret:
        return True
    return request.headers.get("X-Setup-Secret") == secret


def _fetch_one(cur, sql: str, params: tuple):
    cur.execute(sql, params)
    return cur.fetchone()


@bp_setup.post("/bootstrap-clinic")
def bootstrap_clinic():
    """
    Cria (ou garante) tenant + subscription + clinic + admin + user_clinic.

    Body:
    {
      "tenant_code": "TENANT_GRP_001",
      "tenant_legal_name": "Grupo Teste 001",
      "clinic_code": "CLINIC_001",
      "clinic_name": "Clínica Alpha",
      "email": "admin@alpha.com",
      "password": "123456",
      "plan_code": "TRIAL_DEFAULT",
      "dev_auto_verify_email": true,
      "force_trial_days": 30
    }
    """
    if not _setup_allowed():
        return jsonify({"error": "setup_forbidden"}), 403

    data = request.get_json(force=True) or {}

    tenant_code = (data.get("tenant_code") or "").strip()
    tenant_legal_name = (data.get("tenant_legal_name") or "").strip()
    clinic_code = (data.get("clinic_code") or "").strip()
    clinic_name = (data.get("clinic_name") or "").strip()

    admin_email = (data.get("email") or "").strip().lower()
    admin_password = data.get("password")

    plan_code = (data.get("plan_code") or "TRIAL_DEFAULT").strip()
    dev_auto_verify = bool(data.get("dev_auto_verify_email", False))
    trial_days = int(data.get("force_trial_days", 30) or 30)

    if not all([tenant_code, tenant_legal_name, clinic_code, clinic_name, admin_email, admin_password]):
        return jsonify({"error": "missing_fields"}), 400

    now = _utcnow()
    trial_end = now + timedelta(days=trial_days)

    pwd_hash = hash_password(admin_password)

    with transaction() as (conn, cur):
        # 0) plan_id
        plan_row = _fetch_one(
            cur,
            """
            SELECT plan_id
              FROM subscription_plan
             WHERE plan_code=%s
               AND (deleted_at IS NULL OR 1=1)
             LIMIT 1
            """,
            (plan_code,),
        )
        if not plan_row:
            return jsonify({"error": "invalid_plan_code"}), 400
        plan_id = int(plan_row["plan_id"])

        # 1) TENANT (idempotente por tenant_code)
        tenant_row = _fetch_one(
            cur,
            """
            SELECT tenant_id
              FROM tenant
             WHERE tenant_code=%s
               AND (deleted_at IS NULL OR 1=1)
             LIMIT 1
            """,
            (tenant_code,),
        )

        if tenant_row:
            tenant_id = int(tenant_row["tenant_id"])
        else:
            tenant_id = execute_in_tx(
                cur,
                """
                INSERT INTO tenant (tenant_code, legal_name, status, created_at)
                VALUES (%s, %s, 'ACTIVE', %s)
                """,
                (tenant_code, tenant_legal_name, now),
            )

        # 2) SUBSCRIPTION do tenant (cria se não existir)
        sub_row = _fetch_one(
            cur,
            """
            SELECT tenant_subscription_id, tenant_id, plan_id, status, trial_start_at, trial_end_at, created_at
              FROM tenant_subscription
             WHERE tenant_id=%s
             ORDER BY tenant_subscription_id DESC
             LIMIT 1
            """,
            (tenant_id,),
        )

        if not sub_row:
            execute_in_tx(
                cur,
                """
                INSERT INTO tenant_subscription (tenant_id, plan_id, status, trial_start_at, trial_end_at, created_at)
                VALUES (%s, %s, 'TRIAL', %s, %s, %s)
                """,
                (tenant_id, plan_id, now, trial_end, now),
            )

        # 3) CLINIC (idempotente por tenant_id + clinic_code)
        clinic_row = _fetch_one(
            cur,
            """
            SELECT clinic_id
              FROM clinic
             WHERE tenant_id=%s
               AND clinic_code=%s
               AND (deleted_at IS NULL OR 1=1)
             LIMIT 1
            """,
            (tenant_id, clinic_code),
        )

        if clinic_row:
            clinic_id = int(clinic_row["clinic_id"])
        else:
            clinic_id = execute_in_tx(
                cur,
                """
                INSERT INTO clinic (tenant_id, clinic_code, name, status, created_at)
                VALUES (%s, %s, %s, 'ACTIVE', %s)
                """,
                (tenant_id, clinic_code, clinic_name, now),
            )

        # 4) USER_ACCOUNT (por email)
        user_row = _fetch_one(
            cur,
            """
            SELECT user_id, user_type, email_verified
              FROM user_account
             WHERE email=%s
               AND (deleted_at IS NULL OR 1=1)
             LIMIT 1
            """,
            (admin_email,),
        )

        if user_row:
            user_id = int(user_row["user_id"])

            # garante tipo/tenant/status
            execute_in_tx(
                cur,
                """
                UPDATE user_account
                   SET user_type='TENANT_ADMIN',
                       tenant_id=%s,
                       status='ACTIVE',
                       password_hash=%s,
                       updated_at=%s
                 WHERE user_id=%s
                """,
                (tenant_id, pwd_hash, now, user_id),
            )
        else:
            user_id = execute_in_tx(
                cur,
                """
                INSERT INTO user_account (user_type, tenant_id, email, email_verified, password_hash, status, created_at)
                VALUES ('TENANT_ADMIN', %s, %s, 0, %s, 'ACTIVE', %s)
                """,
                (tenant_id, admin_email, pwd_hash, now),
            )

        # 5) USER_CLINIC (vínculo ativo ADMIN)
        uc_row = _fetch_one(
            cur,
            """
            SELECT 1
              FROM user_clinic
             WHERE tenant_id=%s
               AND user_id=%s
               AND clinic_id=%s
             LIMIT 1
            """,
            (tenant_id, user_id, clinic_id),
        )

        if uc_row:
            execute_in_tx(
                cur,
                """
                UPDATE user_clinic
                   SET role_code='ADMIN',
                       active_flag=1,
                       updated_at=%s
                 WHERE tenant_id=%s AND user_id=%s AND clinic_id=%s
                """,
                (now, tenant_id, user_id, clinic_id),
            )
        else:
            execute_in_tx(
                cur,
                """
                INSERT INTO user_clinic (tenant_id, user_id, clinic_id, role_code, active_flag, created_at)
                VALUES (%s, %s, %s, 'ADMIN', 1, %s)
                """,
                (tenant_id, user_id, clinic_id, now),
            )

        # 6) EMAIL VERIFICATION (DEV)
        dev_email_code = None

        if dev_auto_verify:
            execute_in_tx(
                cur,
                "UPDATE user_account SET email_verified=1, updated_at=%s WHERE user_id=%s",
                (now, user_id),
            )
        else:
            code = generate_numeric_code(6)
            dev_email_code = code

            # pode existir tabela/contact_verification com colunas diferentes em alguns schemas
            # mas pelo seu auth/me atual, ela existe e funciona com (user_id, purpose, target, code, status, expires_at, created_at)
            execute_in_tx(
                cur,
                """
                INSERT INTO contact_verification (user_id, purpose, target, code, status, expires_at, created_at)
                VALUES (%s, 'EMAIL_VERIFY', %s, %s, 'SENT', %s, %s)
                """,
                (user_id, admin_email, code, now + timedelta(minutes=30), now),
            )

    return jsonify(
        {
            "tenant_id": tenant_id,
            "clinic_id": clinic_id,
            "user_id": user_id,
            "email_verified": bool(dev_auto_verify),
            "dev_email_code": dev_email_code,
        }
    ), 201
