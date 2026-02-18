from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g

from db import transaction, execute_in_tx, fetch_one
from routes.middlewares import tenant_subscription_required, auth_required
from utils.security import generate_token
from limits import check_limits, apply_usage_delta  # ✅ limits na raiz do backend

bp_assoc = Blueprint("associations", __name__, url_prefix="/api")


def _now():
    return datetime.utcnow()


@bp_assoc.post("/clinic/clients/request-link")
@tenant_subscription_required
def clinic_request_link():
    """
    Clínica solicita vínculo para um client_id EXISTENTE.

    Payload:
    {
      "clinic_id": 5,
      "client_id": 123,
      "channel": "INBOX" | "EMAIL" | "PUSH" | "SMS" (por enquanto INBOX)
    }

    Retorna dev_code para testes.
    """
    data = request.get_json(force=True) or {}
    tenant_id = int(g.user["tenant_id"])
    clinic_id = data.get("clinic_id")
    client_id = data.get("client_id")
    channel = (data.get("channel") or "INBOX").upper()

    if not clinic_id or not client_id:
        return jsonify({"error": "missing_fields"}), 400

    clinic_id = int(clinic_id)
    client_id = int(client_id)

    now = _now()
    expires_at = now + timedelta(minutes=15)
    code = generate_token(12)

    with transaction() as (conn, cur):
        # relacionamento já existe?
        row = fetch_one(
            """
            SELECT client_clinic_id, status
              FROM client_clinic
             WHERE tenant_id=%s AND clinic_id=%s AND client_id=%s AND deleted_at IS NULL
             LIMIT 1
            """,
            (tenant_id, clinic_id, client_id),
        )

        # já ativo? idempotente
        if row and row["status"] == "ACTIVE":
            return jsonify({"ok": True, "already_active": True}), 200

        if not row:
            # cria PENDING (relationship_start tem default CURRENT_TIMESTAMP)
            execute_in_tx(
                cur,
                """
                INSERT INTO client_clinic (tenant_id, clinic_id, client_id, status, created_at)
                VALUES (%s, %s, %s, 'PENDING', %s)
                """,
                (tenant_id, clinic_id, client_id, now),
            )
        else:
            # se já existia e estava INACTIVE/PENDING, volta para PENDING e limpa encerramento/inativação
            execute_in_tx(
                cur,
                """
                UPDATE client_clinic
                   SET status='PENDING',
                       relationship_end=NULL,
                       inactivated_by_type=NULL,
                       inactivated_reason=NULL,
                       updated_at=%s,
                       updated_by=%s
                 WHERE client_clinic_id=%s
                """,
                (now, int(g.user["user_id"]), row["client_clinic_id"]),
            )

        # cria autorização
        execute_in_tx(
            cur,
            """
            INSERT INTO client_clinic_authorization
              (tenant_id, clinic_id, client_id, code, channel, status, expires_at, created_at, created_by)
            VALUES (%s, %s, %s, %s, %s, 'SENT', %s, %s, %s)
            """,
            (tenant_id, clinic_id, client_id, code, channel, expires_at, now, int(g.user["user_id"])),
        )

        # inbox para o cliente (se existir user_account CLIENT)
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

    return jsonify({"ok": True, "expires_at": expires_at.isoformat(), "dev_code": code}), 201


@bp_assoc.post("/client/clinics/authorize")
@auth_required
def client_authorize_link():
    """
    Cliente autoriza vínculo usando o code recebido.

    Body:
      { "code": "XXXX" }

    Efeito:
      - client_clinic.status -> ACTIVE
      - relationship_start -> NOW() (sobrescreve valor anterior se estava PENDING)
      - relationship_end -> NULL
      - authorization.status -> USED
      - valida limite de clientes (inc_clients=1) apenas quando realmente ativa (idempotente)
    """
    data = request.get_json(force=True) or {}
    code = (data.get("code") or "").strip()
    if not code:
        return jsonify({"error": "missing_code"}), 400

    user = g.user
    if user.get("user_type") != "CLIENT":
        return jsonify({"error": "only_client_can_authorize"}), 403
    if not user.get("client_id"):
        return jsonify({"error": "client_id_missing_in_token"}), 403

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

        # 2) lock do vínculo para evitar corrida
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

        # idempotente: já ativo
        if cc and cc.get("status") == "ACTIVE":
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

        # 3) valida limite (somente se vai ativar agora)
        ok, payload = check_limits(tenant_id, inc_clients=1)
        if not ok:
            return jsonify(payload), 402

        # 4) marca authorization como USED
        execute_in_tx(
            cur,
            """
            UPDATE client_clinic_authorization
               SET status='USED', used_at=%s, updated_at=%s
             WHERE authorization_id=%s
            """,
            (now, now, auth["authorization_id"]),
        )

        # 5) ativa vínculo (se não existe, cria ACTIVE)
        if not cc:
            execute_in_tx(
                cur,
                """
                INSERT INTO client_clinic
                  (tenant_id, clinic_id, client_id, status, relationship_start, relationship_end, created_at)
                VALUES
                  (%s, %s, %s, 'ACTIVE', %s, NULL, %s)
                """,
                (tenant_id, clinic_id, client_id, now, now),
            )
        else:
            execute_in_tx(
                cur,
                """
                UPDATE client_clinic
                   SET status='ACTIVE',
                       relationship_start=%s,
                       relationship_end=NULL,
                       inactivated_by_type=NULL,
                       inactivated_reason=NULL,
                       updated_at=%s,
                       updated_by=%s
                 WHERE client_clinic_id=%s
                """,
                (now, now, int(user["user_id"]), cc["client_clinic_id"]),
            )

        # 6) aplica consumo no tenant_usage (clients_count +1)
        apply_usage_delta(tenant_id, inc_clients=1)

    return jsonify({"ok": True, "clinic_id": clinic_id, "tenant_id": tenant_id}), 200
