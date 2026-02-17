from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g

from db import transaction, execute_in_tx, fetch_one
from routes.middlewares import tenant_subscription_required, auth_required
from utils.security import generate_token
from limits import check_limits, apply_usage_delta  # ✅ usa limits na raiz do backend

bp_assoc = Blueprint("associations", __name__, url_prefix="/api")


def _now():
    return datetime.utcnow()


@bp_assoc.post("/clinic/clients/request-link")
@tenant_subscription_required
def clinic_request_link():
    data = request.get_json(force=True)
    tenant_id = g.user["tenant_id"]
    clinic_id = data.get("clinic_id")
    client_id = data.get("client_id")
    channel = data.get("channel", "INBOX")

    if not clinic_id or not client_id:
        return jsonify({"error": "missing_fields"}), 400

    now = _now()
    expires_at = now + timedelta(minutes=15)
    code = generate_token(12)

    with transaction() as (conn, cur):
        row = fetch_one(
            """
            SELECT client_clinic_id, status
              FROM client_clinic
             WHERE tenant_id=%s AND clinic_id=%s AND client_id=%s AND deleted_at IS NULL
             LIMIT 1
            """,
            (tenant_id, clinic_id, client_id),
        )

        if row and row["status"] == "ACTIVE":
            return jsonify({"ok": True, "already_active": True}), 200

        if not row:
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
                (now, row["client_clinic_id"]),
            )

        execute_in_tx(
            cur,
            """
            INSERT INTO client_clinic_authorization
              (tenant_id, clinic_id, client_id, code, channel, status, expires_at, created_at, created_by)
            VALUES (%s, %s, %s, %s, %s, 'SENT', %s, %s, %s)
            """,
            (tenant_id, clinic_id, client_id, code, channel, expires_at, now, g.user["user_id"]),
        )

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
                    u["user_id"],
                    tenant_id,
                    "Código de autorização",
                    "Use o código para autorizar o vínculo com a clínica.",
                    f'{{"code":"{code}","clinic_id":{clinic_id}}}',
                    now,
                    now,
                ),
            )

    return jsonify({"ok": True, "expires_at": expires_at.isoformat(), "dev_code": code}), 201


@bp_assoc.post("/client/clinics/authorize")
@auth_required
def client_authorize_link():
    data = request.get_json(force=True)
    code = data.get("code")
    if not code:
        return jsonify({"error": "missing_code"}), 400

    user = g.user
    if user.get("user_type") != "CLIENT":
        return jsonify({"error": "only_client_can_authorize"}), 403

    now = _now()

    with transaction() as (conn, cur):
        # 1) localizar autorização
        auth = fetch_one(
            """
            SELECT authorization_id, tenant_id, clinic_id, client_id, status, expires_at
              FROM client_clinic_authorization
             WHERE code=%s
             LIMIT 1
            """,
            (code,),
        )

        if not auth:
            return jsonify({"error": "invalid_code"}), 400
        if auth["status"] != "SENT":
            return jsonify({"error": "code_not_available"}), 400
        if auth["expires_at"] and now > auth["expires_at"]:
            execute_in_tx(
                cur,
                """
                UPDATE client_clinic_authorization
                   SET status='EXPIRED', updated_at=%s
                 WHERE authorization_id=%s
                """,
                (now, auth["authorization_id"]),
            )
            return jsonify({"error": "code_expired"}), 400

        if int(auth["client_id"]) != int(user["client_id"]):
            return jsonify({"error": "code_not_for_this_client"}), 403

        tenant_id = int(auth["tenant_id"])
        clinic_id = int(auth["clinic_id"])
        client_id = int(auth["client_id"])

        # 2) lock do vínculo para evitar corrida e não contar duas vezes
        cur.execute(
            """
            SELECT client_clinic_id, status
              FROM client_clinic
             WHERE tenant_id=%s AND clinic_id=%s AND client_id=%s AND deleted_at IS NULL
             LIMIT 1
             FOR UPDATE
            """,
            (tenant_id, clinic_id, client_id),
        )
        cc = cur.fetchone()

        # Se já está ACTIVE, não incrementa nem consome limite (idempotente)
        if cc and cc.get("status") == "ACTIVE":
            # marca autorização como USED mesmo assim? melhor: sim, para não reutilizarem.
            execute_in_tx(
                cur,
                """
                UPDATE client_clinic_authorization
                   SET status='USED', used_at=%s, updated_at=%s
                 WHERE authorization_id=%s
                """,
                (now, now, auth["authorization_id"]),
            )
            return jsonify({"ok": True, "already_active": True, "clinic_id": clinic_id, "tenant_id": tenant_id}), 200

        # 3) limite de clients (contando por vínculo ACTIVE)
        ok, payload = check_limits(tenant_id, inc_clients=1)
        if not ok:
            # Não marca authorization como USED para permitir tentar novamente após upgrade/plano.
            return jsonify(payload), 402

        # 4) marcar autorização como USED
        execute_in_tx(
            cur,
            """
            UPDATE client_clinic_authorization
               SET status='USED', used_at=%s, updated_at=%s
             WHERE authorization_id=%s
            """,
            (now, now, auth["authorization_id"]),
        )

        # 5) ativar vínculo (se não existe, cria direto ACTIVE)
        if not cc:
            execute_in_tx(
                cur,
                """
                INSERT INTO client_clinic (tenant_id, clinic_id, client_id, status, authorized_at, created_at)
                VALUES (%s, %s, %s, 'ACTIVE', %s, %s)
                """,
                (tenant_id, clinic_id, client_id, now, now),
            )
        else:
            execute_in_tx(
                cur,
                """
                UPDATE client_clinic
                   SET status='ACTIVE', authorized_at=%s, updated_at=%s
                 WHERE client_clinic_id=%s
                """,
                (now, now, cc["client_clinic_id"]),
            )

    # 6) aplicar delta (fora da transação principal também funcionaria, mas aqui é OK chamar após commit)
    # Como o apply_usage_delta abre sua própria transação, chamamos aqui após o bloco acima.
    apply_usage_delta(tenant_id, inc_clients=1)

    return jsonify({"ok": True, "clinic_id": clinic_id, "tenant_id": tenant_id})
