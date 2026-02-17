import json
from datetime import datetime

from flask import Blueprint, request, jsonify, g

from db import fetch_one, transaction, execute_in_tx, execute_no_return
from routes.middlewares import auth_required, tenant_subscription_required
from limits import check_limits, apply_usage_delta


bp_secure_submissions = Blueprint("secure_submissions", __name__, url_prefix="/api/secure/form-submissions")


def _now():
    return datetime.utcnow()


def _json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _subscription_guard_or_payload(tenant_id: int):
    """
    Para chamadas feitas por CLIENT (não passam pelo tenant_subscription_required).
    Retorna (ok, payload).
    """
    sub = fetch_one(
        """
        SELECT tenant_subscription_id, tenant_id, plan_id, status, trial_end_at
          FROM tenant_subscription
         WHERE tenant_id=%s
           AND deleted_at IS NULL
         ORDER BY tenant_subscription_id DESC
         LIMIT 1
        """,
        (tenant_id,),
    )

    if not sub:
        return False, {"error": "subscription_not_found"}

    status = sub.get("status")
    trial_end = sub.get("trial_end_at")
    now = _now()

    if status == "TRIAL":
        if trial_end and now > trial_end:
            return False, {
                "error": "subscription_trial_expired",
                "subscription": {
                    "status": "EXPIRED",
                    "trial_end_at": trial_end.isoformat() if trial_end else None,
                    "plan_id": sub.get("plan_id"),
                },
            }
        return True, {"ok": True, "subscription_status": "TRIAL"}

    if status == "ACTIVE":
        return True, {"ok": True, "subscription_status": "ACTIVE"}

    return False, {
        "error": "subscription_inactive",
        "subscription": {
            "status": status,
            "trial_end_at": trial_end.isoformat() if trial_end else None,
            "plan_id": sub.get("plan_id"),
        },
    }


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


def _get_tenant_id_for_clinic(clinic_id: int) -> int | None:
    row = fetch_one(
        """
        SELECT tenant_id
          FROM clinic
         WHERE clinic_id=%s AND deleted_at IS NULL
         LIMIT 1
        """,
        (clinic_id,),
    )
    return int(row["tenant_id"]) if row else None


def _get_active_client_clinic(tenant_id: int, clinic_id: int, client_id: int):
    return fetch_one(
        """
        SELECT client_clinic_id
          FROM client_clinic
         WHERE tenant_id=%s
           AND clinic_id=%s
           AND client_id=%s
           AND status='ACTIVE'
           AND deleted_at IS NULL
         LIMIT 1
        """,
        (tenant_id, clinic_id, client_id),
    )


def _get_published_form_version_schema(tenant_id: int, id_form: int, id_form_version: int):
    return fetch_one(
        """
        SELECT schema_json, status
          FROM form_version
         WHERE id_form_version=%s
           AND tenant_id=%s
           AND id_form=%s
           AND deleted_at IS NULL
         LIMIT 1
        """,
        (id_form_version, tenant_id, id_form),
    )


# -------------------------------------------------------
# CREATE SECURE SUBMISSION (clinic staff OR client)
# -------------------------------------------------------
@bp_secure_submissions.post("")
@auth_required
def create_secure_submission():
    data = request.get_json(force=True) or {}

    clinic_id = data.get("clinic_id")
    id_form = data.get("id_form")
    id_form_version = data.get("id_form_version")

    if not clinic_id or not id_form or not id_form_version:
        return jsonify({"error": "missing_fields", "required": ["clinic_id", "id_form", "id_form_version"]}), 400

    clinic_id = int(clinic_id)
    id_form = int(id_form)
    id_form_version = int(id_form_version)

    user = g.user
    user_type = user.get("user_type")

    # Resolver tenant_id + client_id conforme tipo
    if user_type == "CLIENT":
        client_id = user.get("client_id")
        if not client_id:
            return jsonify({"error": "missing_client_in_token"}), 400
        client_id = int(client_id)

        tenant_id = _get_tenant_id_for_clinic(clinic_id)
        if not tenant_id:
            return jsonify({"error": "clinic_not_found"}), 404

        # subscription gate também para CLIENT
        ok_sub, payload_sub = _subscription_guard_or_payload(int(tenant_id))
        if not ok_sub:
            return jsonify(payload_sub), 402

    else:
        # clinic user (tenant_id vem do token)
        tenant_id = user.get("tenant_id")
        if not tenant_id:
            return jsonify({"error": "missing_tenant_in_token"}), 400
        tenant_id = int(tenant_id)

        # exige subscription válida
        # (usa o mesmo decorator das rotas de tenant)
        # Como aqui usamos @auth_required, faremos a checagem via mesma regra de trial/active:
        ok_sub, payload_sub = _subscription_guard_or_payload(int(tenant_id))
        if not ok_sub:
            return jsonify(payload_sub), 402

        # valida acesso do usuário à clínica
        if not _user_has_access_to_clinic(tenant_id, int(user["user_id"]), clinic_id):
            return jsonify({"error": "forbidden_clinic_access"}), 403

        # client_id vem do body para clínica
        client_id = data.get("client_id")
        if not client_id:
            return jsonify({"error": "missing_client_id"}), 400
        client_id = int(client_id)

    # vínculo client↔clinic precisa estar ACTIVE
    cc = _get_active_client_clinic(int(tenant_id), clinic_id, int(client_id))
    if not cc:
        return jsonify({"error": "client_not_active_for_clinic"}), 409

    client_clinic_id = int(cc["client_clinic_id"])

    # form_version precisa ser PUBLISHED
    fv = _get_published_form_version_schema(int(tenant_id), id_form, id_form_version)
    if not fv:
        return jsonify({"error": "form_version_not_found"}), 404
    if fv.get("status") != "PUBLISHED":
        return jsonify({"error": "form_version_not_published"}), 400

    # Limite submissions/mês
    ok_lim, payload_lim = check_limits(int(tenant_id), inc_submissions=1)
    if not ok_lim:
        return jsonify(payload_lim), 402

    snapshot_schema_str = _json_dumps(fv["schema_json"])

    with transaction() as (conn, cur):
        new_id = execute_in_tx(
            cur,
            """
            INSERT INTO form_submission
            (
              tenant_id,
              id_form,
              id_form_version,
              clinic_id,
              client_id,
              client_clinic_id,
              status,
              payload_json,
              snapshot_schema_json,
              created_at,
              created_by
            )
            VALUES
            (
              %s, %s, %s,
              %s, %s, %s,
              'DRAFT',
              '{}',
              %s,
              NOW(),
              %s
            )
            """,
            (
                int(tenant_id),
                id_form,
                id_form_version,
                clinic_id,
                int(client_id),
                client_clinic_id,
                snapshot_schema_str,
                int(user["user_id"]),
            ),
        )

    # aplicar delta após sucesso
    apply_usage_delta(int(tenant_id), inc_submissions=1)

    row = fetch_one(
        """
        SELECT *
          FROM form_submission
         WHERE id_form_submission=%s
           AND tenant_id=%s
           AND deleted_at IS NULL
         LIMIT 1
        """,
        (int(new_id), int(tenant_id)),
    )

    return jsonify(row), 201


# -------------------------------------------------------
# UPDATE PAYLOAD (secure)
# -------------------------------------------------------
@bp_secure_submissions.put("/<int:id_form_submission>/payload")
@auth_required
def secure_save_payload(id_form_submission: int):
    data = request.get_json(force=True) or {}
    payload_json = data.get("payload_json")

    if payload_json is None:
        return jsonify({"error": "payload_json_is_required"}), 400

    user = g.user
    user_type = user.get("user_type")

    # localizar submission
    sub = fetch_one(
        """
        SELECT id_form_submission, tenant_id, clinic_id, client_id, status
          FROM form_submission
         WHERE id_form_submission=%s
           AND deleted_at IS NULL
         LIMIT 1
        """,
        (id_form_submission,),
    )
    if not sub:
        return jsonify({"error": "submission_not_found"}), 404

    tenant_id = int(sub["tenant_id"])
    clinic_id = int(sub["clinic_id"])
    client_id = int(sub["client_id"])

    # autorização por tipo
    if user_type == "CLIENT":
        if not user.get("client_id") or int(user["client_id"]) != client_id:
            return jsonify({"error": "forbidden_submission_access"}), 403

        ok_sub, payload_sub = _subscription_guard_or_payload(tenant_id)
        if not ok_sub:
            return jsonify(payload_sub), 402

        cc = _get_active_client_clinic(tenant_id, clinic_id, client_id)
        if not cc:
            return jsonify({"error": "client_not_active_for_clinic"}), 409

    else:
        if not user.get("tenant_id") or int(user["tenant_id"]) != tenant_id:
            return jsonify({"error": "forbidden_submission_access"}), 403

        ok_sub, payload_sub = _subscription_guard_or_payload(tenant_id)
        if not ok_sub:
            return jsonify(payload_sub), 402

        if not _user_has_access_to_clinic(tenant_id, int(user["user_id"]), clinic_id):
            return jsonify({"error": "forbidden_clinic_access"}), 403

    if sub.get("status") == "FINAL":
        return jsonify({"error": "submission_is_final"}), 409

    payload_str = _json_dumps(payload_json)

    execute_no_return(
        """
        UPDATE form_submission
           SET payload_json=%s,
               updated_at=NOW(),
               updated_by=%s
         WHERE id_form_submission=%s
           AND deleted_at IS NULL
        """,
        (payload_str, int(user["user_id"]), id_form_submission),
    )

    row = fetch_one(
        """
        SELECT *
          FROM form_submission
         WHERE id_form_submission=%s
           AND deleted_at IS NULL
         LIMIT 1
        """,
        (id_form_submission,),
    )
    return jsonify(row)


# -------------------------------------------------------
# FINALIZE SUBMISSION (secure)
# -------------------------------------------------------
@bp_secure_submissions.post("/<int:id_form_submission>/finalize")
@auth_required
def secure_finalize(id_form_submission: int):
    user = g.user
    user_type = user.get("user_type")

    sub = fetch_one(
        """
        SELECT id_form_submission, tenant_id, clinic_id, client_id, status
          FROM form_submission
         WHERE id_form_submission=%s
           AND deleted_at IS NULL
         LIMIT 1
        """,
        (id_form_submission,),
    )
    if not sub:
        return jsonify({"error": "submission_not_found"}), 404

    tenant_id = int(sub["tenant_id"])
    clinic_id = int(sub["clinic_id"])
    client_id = int(sub["client_id"])

    if user_type == "CLIENT":
        if not user.get("client_id") or int(user["client_id"]) != client_id:
            return jsonify({"error": "forbidden_submission_access"}), 403

        ok_sub, payload_sub = _subscription_guard_or_payload(tenant_id)
        if not ok_sub:
            return jsonify(payload_sub), 402

        cc = _get_active_client_clinic(tenant_id, clinic_id, client_id)
        if not cc:
            return jsonify({"error": "client_not_active_for_clinic"}), 409

    else:
        if not user.get("tenant_id") or int(user["tenant_id"]) != tenant_id:
            return jsonify({"error": "forbidden_submission_access"}), 403

        ok_sub, payload_sub = _subscription_guard_or_payload(tenant_id)
        if not ok_sub:
            return jsonify(payload_sub), 402

        if not _user_has_access_to_clinic(tenant_id, int(user["user_id"]), clinic_id):
            return jsonify({"error": "forbidden_clinic_access"}), 403

    if sub.get("status") == "FINAL":
        row = fetch_one(
            "SELECT * FROM form_submission WHERE id_form_submission=%s AND deleted_at IS NULL LIMIT 1",
            (id_form_submission,),
        )
        return jsonify(row)

    execute_no_return(
        """
        UPDATE form_submission
           SET status='FINAL',
               submitted_at=NOW(),
               updated_at=NOW(),
               updated_by=%s
         WHERE id_form_submission=%s
           AND deleted_at IS NULL
        """,
        (int(user["user_id"]), id_form_submission),
    )

    row = fetch_one(
        "SELECT * FROM form_submission WHERE id_form_submission=%s AND deleted_at IS NULL LIMIT 1",
        (id_form_submission,),
    )
    return jsonify(row)
