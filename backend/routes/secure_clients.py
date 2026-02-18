from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g

from db import transaction, execute_in_tx, fetch_one, fetch_all
from routes.middlewares import tenant_subscription_required, auth_required
from utils.security import generate_token, hash_password, generate_numeric_code

bp_secure_clients = Blueprint("secure_clients", __name__, url_prefix="/api/secure/clinics")


def _now():
    return datetime.utcnow()


def _require_clinic_access(tenant_id: int, user_id: int, clinic_id: int) -> bool:
    row = fetch_one(
        """
        SELECT 1
          FROM clinic c
          JOIN user_clinic uc
            ON uc.tenant_id = c.tenant_id
           AND uc.clinic_id = c.clinic_id
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


@bp_secure_clients.get("/<int:clinic_id>/clients")
@tenant_subscription_required
def secure_list_clinic_clients(clinic_id: int):
    """
    Lista APENAS clientes com relacionamento (client_clinic) com a clínica.

    Query:
      ?status=ACTIVE|PENDING|ALL   (default ACTIVE)

    Retorno (por cliente):
      client_id, full_name, email, phone, relationship_status, authorized_at
    """
    user = g.user
    tenant_id = int(user["tenant_id"])
    user_id = int(user["user_id"])

    if not _require_clinic_access(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    status = (request.args.get("status") or "ACTIVE").upper()
    if status not in ("ACTIVE", "PENDING", "ALL"):
        return jsonify({"error": "invalid_status"}), 400

    where_status = ""
    params = [tenant_id, clinic_id]
    if status != "ALL":
        where_status = " AND cc.status = %s "
        params.append(status)

    rows = fetch_all(
    f"""
    SELECT
      c.client_id,
      c.full_name,
      c.email,
      c.phone,
      c.status AS client_status,
      cc.status AS relationship_status,
      cc.relationship_start,
      cc.relationship_end
    FROM client_clinic cc
    JOIN client c
      ON c.client_id = cc.client_id
     AND c.deleted_at IS NULL
    WHERE cc.tenant_id = %s
      AND cc.clinic_id = %s
      {where_status}
      AND cc.deleted_at IS NULL
    ORDER BY c.full_name ASC
    """,
    tuple(params),
    )


    return jsonify(rows)


@bp_secure_clients.post("/<int:clinic_id>/clients/request-link")
@tenant_subscription_required
def secure_request_link_existing_client(clinic_id: int):
    """
    Clínica solicita associação para um cliente JÁ EXISTENTE (global).
    Payload:
      {
        "email_or_phone": "cliente@email.com ou 3519....",
        "channel": "INBOX" | "EMAIL"  (por enquanto INBOX; EMAIL fica para futuro)
      }

    Retorna dev_code para testes.
    """
    user = g.user
    tenant_id = int(user["tenant_id"])
    user_id = int(user["user_id"])

    if not _require_clinic_access(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    data = request.get_json(force=True) or {}
    email_or_phone = (data.get("email_or_phone") or "").strip()
    channel = (data.get("channel") or "INBOX").upper()

    if not email_or_phone:
        return jsonify({"error": "missing_email_or_phone"}), 400

    # Busca cliente global por email ou phone
    cli = fetch_one(
        """
        SELECT client_id
          FROM client
         WHERE deleted_at IS NULL
           AND (email=%s OR phone=%s)
         LIMIT 1
        """,
        (email_or_phone, email_or_phone),
    )
    if not cli:
        return jsonify({"error": "client_not_found"}), 404

    client_id = int(cli["client_id"])
    now = _now()
    expires_at = now + timedelta(minutes=15)
    code = generate_token(12)

    with transaction() as (conn, cur):
        rel = fetch_one(
            """
            SELECT client_clinic_id, status
              FROM client_clinic
             WHERE tenant_id=%s AND clinic_id=%s AND client_id=%s AND deleted_at IS NULL
             LIMIT 1
            """,
            (tenant_id, clinic_id, client_id),
        )

        if rel and rel["status"] == "ACTIVE":
            return jsonify({"ok": True, "already_active": True}), 200

        if not rel:
            execute_in_tx(
                cur,
                """
                INSERT INTO client_clinic (tenant_id, clinic_id, client_id, status, created_at)
                VALUES (%s, %s, %s, 'PENDING', %s)
                """,
                (tenant_id, clinic_id, client_id, now),
            )
        else:
            execute_in_tx(
                cur,
                """
                UPDATE client_clinic
                   SET status='PENDING', updated_at=%s
                 WHERE client_clinic_id=%s
                """,
                (now, rel["client_clinic_id"]),
            )

        execute_in_tx(
            cur,
            """
            INSERT INTO client_clinic_authorization
              (tenant_id, clinic_id, client_id, code, channel, status, expires_at, created_at, created_by)
            VALUES (%s, %s, %s, %s, %s, 'SENT', %s, %s, %s)
            """,
            (tenant_id, clinic_id, client_id, code, channel, expires_at, now, user_id),
        )

        # Se existir user_account do cliente, envia "INBOX"
        u = fetch_one(
            """
            SELECT user_id
              FROM user_account
             WHERE client_id=%s AND deleted_at IS NULL
             LIMIT 1
            """,
            (client_id,),
        )
        if u:
            execute_in_tx(
                cur,
                """
                INSERT INTO notification (user_id, tenant_id, title, message, type, channel, meta_json, sent_at, created_at)
                VALUES (%s, %s, %s, %s, 'AUTH_CODE', 'INBOX', %s, %s, %s)
                """,
                (
                    int(u["user_id"]),
                    tenant_id,
                    "Código de autorização",
                    "Use o código para autorizar o vínculo com a clínica.",
                    f'{{"code":"{code}","clinic_id":{clinic_id}}}',
                    now,
                    now,
                ),
            )

    return jsonify({"ok": True, "client_id": client_id, "expires_at": expires_at.isoformat(), "dev_code": code}), 201


@bp_secure_clients.post("/<int:clinic_id>/clients/create-and-request-link")
@tenant_subscription_required
def secure_create_client_and_request_link(clinic_id: int):
    """
    Clínica cadastra cliente (global) + cria user_account CLIENT com senha temporária
    + solicita associação PENDING + código.

    Payload:
      {
        "full_name": "...",
        "email": "...",
        "phone": "...",
        "temp_password": "123456" (opcional),
        "channel": "INBOX" | "EMAIL" (default INBOX)
      }

    Retorna:
      - client_id
      - client_user_id
      - dev_auth_code (para autorizar vínculo)
      - dev_email_verify_code (para validar email do CLIENT)
    """
    user = g.user
    tenant_id = int(user["tenant_id"])
    user_id = int(user["user_id"])

    if not _require_clinic_access(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    data = request.get_json(force=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip()
    phone = (data.get("phone") or "").strip() or None
    temp_password = (data.get("temp_password") or "123456").strip()
    channel = (data.get("channel") or "INBOX").upper()

    if not full_name or not email:
        return jsonify({"error": "missing_fields", "required": ["full_name", "email"]}), 400

    # Evita duplicação: se já existir client com email/phone
    existing = fetch_one(
        """
        SELECT client_id
          FROM client
         WHERE deleted_at IS NULL
           AND (email=%s OR (%s IS NOT NULL AND phone=%s))
         LIMIT 1
        """,
        (email, phone, phone),
    )
    if existing:
        return jsonify({"error": "client_already_exists", "client_id": int(existing["client_id"])}), 409

    now = _now()
    expires_at = now + timedelta(minutes=15)
    auth_code = generate_token(12)

    pwd_hash = hash_password(temp_password)

    with transaction() as (conn, cur):
        # 1) client (global)
        client_id = execute_in_tx(
            cur,
            """
            INSERT INTO client (full_name, email, phone, status, created_at)
            VALUES (%s, %s, %s, 'ACTIVE', %s)
            """,
            (full_name, email, phone, now),
        )

        # 2) user_account CLIENT (global, sem tenant_id)
        client_user_id = execute_in_tx(
            cur,
            """
            INSERT INTO user_account
              (user_type, tenant_id, client_id, email, phone, email_verified, phone_verified, password_hash, status, created_at)
            VALUES
              ('CLIENT', NULL, %s, %s, %s, 0, 0, %s, 'ACTIVE', %s)
            """,
            (int(client_id), email, phone, pwd_hash, now),
        )

        # 3) validação email do CLIENT (dev)
        email_code = generate_numeric_code(6)
        execute_in_tx(
            cur,
            """
            INSERT INTO contact_verification (user_id, purpose, target, code, status, expires_at, created_at)
            VALUES (%s, 'EMAIL_VERIFY', %s, %s, 'SENT', %s, %s)
            """,
            (int(client_user_id), email, email_code, now + timedelta(minutes=30), now),
        )

        # 4) cria relacionamento PENDING
        execute_in_tx(
            cur,
            """
            INSERT INTO client_clinic (tenant_id, clinic_id, client_id, status, created_at)
            VALUES (%s, %s, %s, 'PENDING', %s)
            """,
            (tenant_id, clinic_id, int(client_id), now),
        )

        # 5) cria authorization code
        execute_in_tx(
            cur,
            """
            INSERT INTO client_clinic_authorization
              (tenant_id, clinic_id, client_id, code, channel, status, expires_at, created_at, created_by)
            VALUES (%s, %s, %s, %s, %s, 'SENT', %s, %s, %s)
            """,
            (tenant_id, clinic_id, int(client_id), auth_code, channel, expires_at, now, user_id),
        )

        # 6) inbox para o cliente
        execute_in_tx(
            cur,
            """
            INSERT INTO notification (user_id, tenant_id, title, message, type, channel, meta_json, sent_at, created_at)
            VALUES (%s, %s, %s, %s, 'AUTH_CODE', 'INBOX', %s, %s, %s)
            """,
            (
                int(client_user_id),
                tenant_id,
                "Código de autorização",
                "Use o código para autorizar o vínculo com a clínica.",
                f'{{"code":"{auth_code}","clinic_id":{clinic_id}}}',
                now,
                now,
            ),
        )

    return jsonify(
        {
            "ok": True,
            "client_id": int(client_id),
            "client_user_id": int(client_user_id),
            "temp_password": temp_password,
            "expires_at": expires_at.isoformat(),
            "dev_auth_code": auth_code,
            "dev_email_verify_code": email_code,
        }
    ), 201
