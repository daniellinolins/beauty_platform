from datetime import datetime
from math import ceil

from flask import Blueprint, jsonify, g

from db import fetch_one, fetch_all
from routes.middlewares import auth_required
from limits import get_usage, get_active_plan_limits, BYTES_PER_MB

bp_me = Blueprint("me", __name__, url_prefix="/api/me")


def _utcnow():
    return datetime.utcnow()


def _parse_dt(value):
    # value vindo do pymysql geralmente já é datetime
    return value


def _compute_subscription_snapshot(sub_row, plan_row):
    """
    sub_row: tenant_subscription row (subset)
    plan_row: subscription_plan limits row (subset)
    """
    now = _utcnow()

    snap = {
        "status": None,
        "trial_start_at": None,
        "trial_end_at": None,
        "days_left": None,
        "plan": None,
    }

    if not sub_row:
        snap["status"] = "NONE"
        return snap

    status = sub_row.get("status")
    trial_end = _parse_dt(sub_row.get("trial_end_at"))
    trial_start = _parse_dt(sub_row.get("trial_start_at"))

    snap["trial_start_at"] = trial_start.isoformat() if trial_start else None
    snap["trial_end_at"] = trial_end.isoformat() if trial_end else None

    # Normaliza status com expiração
    if status == "TRIAL":
        if trial_end and now > trial_end:
            snap["status"] = "EXPIRED"
            snap["days_left"] = 0
        else:
            snap["status"] = "TRIAL"
            if trial_end:
                seconds = (trial_end - now).total_seconds()
                snap["days_left"] = max(0, int(ceil(seconds / 86400.0)))
            else:
                snap["days_left"] = None
    else:
        # ACTIVE / CANCELLED / PAUSED etc.
        snap["status"] = status

    if plan_row:
        snap["plan"] = {
            "max_clinics": plan_row.get("max_clinics"),
            "max_clients": plan_row.get("max_clients"),
            "max_forms": plan_row.get("max_forms"),
            "max_submissions_month": plan_row.get("max_submissions_month"),
            "max_storage_mb": plan_row.get("max_storage_mb"),
            "plan_name": plan_row.get("name") if "name" in plan_row else None,
            "plan_code": plan_row.get("plan_code") if "plan_code" in plan_row else None,
        }

    return snap


def _get_subscription_and_plan(tenant_id: int):
    sub = fetch_one(
        """
        SELECT tenant_subscription_id, tenant_id, plan_id, status, trial_start_at, trial_end_at, created_at
          FROM tenant_subscription
         WHERE tenant_id=%s AND deleted_at IS NULL
         ORDER BY tenant_subscription_id DESC
         LIMIT 1
        """,
        (tenant_id,),
    )
    plan = None
    if sub and sub.get("plan_id"):
        plan = fetch_one(
            """
            SELECT plan_id, plan_code, name,
                   max_clinics, max_clients, max_forms, max_submissions_month, max_storage_mb
              FROM subscription_plan
             WHERE plan_id=%s AND deleted_at IS NULL
             LIMIT 1
            """,
            (sub["plan_id"],),
        )
    return sub, plan


def _compute_usage_metrics(usage: dict, limits: dict | None):
    storage_used_bytes = int(usage.get("storage_used_bytes") or 0)
    storage_used_mb = storage_used_bytes / float(BYTES_PER_MB)

    # limites
    max_storage_mb = None
    max_submissions_month = None
    max_forms = None
    max_clients = None

    if limits:
        max_storage_mb = limits.get("max_storage_mb")
        max_submissions_month = limits.get("max_submissions_month")
        max_forms = limits.get("max_forms")
        max_clients = limits.get("max_clients")

    def pct(used, maxv):
        try:
            if maxv is None or int(maxv) <= 0:
                return None
            return round((float(used) / float(maxv)) * 100.0, 2)
        except Exception:
            return None

    computed = {
        "storage_used_bytes": storage_used_bytes,
        "storage_used_mb": round(storage_used_mb, 2),
        "storage_limit_mb": int(max_storage_mb) if (max_storage_mb is not None and int(max_storage_mb) > 0) else None,
        "storage_pct": pct(storage_used_mb, max_storage_mb),
        "submissions_pct": pct(int(usage.get("submissions_count_month") or 0), max_submissions_month),
        "forms_pct": pct(int(usage.get("forms_count") or 0), max_forms),
        "clients_pct": pct(int(usage.get("clients_count") or 0), max_clients),
    }
    return computed


@bp_me.get("/context")
@auth_required
def me_context():
    """
    Returns context for:
      - Clinic users: single tenant + clinics from user_clinic
      - Clients: clinics from client_clinic ACTIVE (can be multiple tenants)
    """
    user = g.user
    now = _utcnow()

    # user_account minimal (garantir email/phone etc.)
    ua = fetch_one(
        """
        SELECT user_id, user_type, tenant_id, client_id,
               email, phone, email_verified, phone_verified, status, created_at
          FROM user_account
         WHERE user_id=%s AND deleted_at IS NULL
         LIMIT 1
        """,
        (user["user_id"],),
    )

    if not ua:
        return jsonify({"error": "user_not_found"}), 404

    user_type = ua.get("user_type")
    tenant_id = ua.get("tenant_id")
    client_id = ua.get("client_id")

    response = {
        "user": {
            "user_id": ua["user_id"],
            "user_type": user_type,
            "tenant_id": tenant_id,
            "client_id": client_id,
            "email": ua.get("email"),
            "phone": ua.get("phone"),
            "email_verified": int(ua.get("email_verified") or 0),
            "phone_verified": int(ua.get("phone_verified") or 0),
            "status": ua.get("status"),
            "created_at": ua.get("created_at").isoformat() if ua.get("created_at") else None,
        },
        "now_utc": now.isoformat(),
    }

    # -------------------------
    # CLIENT: pode ter múltiplos tenants (via clínicas)
    # -------------------------
    if user_type == "CLIENT":
        if not client_id:
            response["client"] = None
            response["tenants"] = []
            response["clinics"] = []
            return jsonify(response)

        client_row = fetch_one(
            """
            SELECT client_id, full_name, email, phone, status, created_at
              FROM client
             WHERE client_id=%s AND deleted_at IS NULL
             LIMIT 1
            """,
            (client_id,),
        )
        response["client"] = client_row

        clinics = fetch_all(
            """
            SELECT cc.tenant_id, cc.clinic_id, cc.client_id, cc.status AS link_status,
                   c.name AS clinic_name, c.clinic_code, c.status AS clinic_status
              FROM client_clinic cc
              JOIN clinic c ON c.clinic_id = cc.clinic_id AND c.tenant_id = cc.tenant_id
             WHERE cc.client_id=%s
               AND cc.status='ACTIVE'
               AND cc.deleted_at IS NULL
               AND c.deleted_at IS NULL
             ORDER BY cc.tenant_id ASC, c.name ASC
            """,
            (client_id,),
        )
        response["clinics"] = clinics

        # tenants (distinct) com limites/uso
        tenant_ids = sorted({int(r["tenant_id"]) for r in clinics}) if clinics else []
        tenants_payload = []

        for tid in tenant_ids:
            t = fetch_one(
                """
                SELECT tenant_id, tenant_code, legal_name, status, created_at
                  FROM tenant
                 WHERE tenant_id=%s AND deleted_at IS NULL
                 LIMIT 1
                """,
                (tid,),
            )

            sub, plan = _get_subscription_and_plan(tid)

            limits = get_active_plan_limits(tid)  # contém max_forms, max_clients, etc.
            usage = get_usage(tid)  # tenant_usage
            computed = _compute_usage_metrics(usage, limits)

            tenants_payload.append(
                {
                    "tenant": t,
                    "subscription": _compute_subscription_snapshot(sub, plan),
                    "limits": limits,
                    "usage": usage,
                    "computed": computed,
                }
            )

        response["tenants"] = tenants_payload
        return jsonify(response)

    # -------------------------
    # CLINIC USERS: 1 tenant (do token) + clinics do user_clinic
    # -------------------------
    if not tenant_id:
        # Usuário não-client sem tenant não faz sentido
        response["tenant"] = None
        response["clinics"] = []
        response["subscription"] = {"status": "NONE"}
        response["limits"] = None
        response["usage"] = None
        response["computed"] = None
        return jsonify(response)

    tenant_row = fetch_one(
        """
        SELECT tenant_id, tenant_code, legal_name, status, created_at
          FROM tenant
         WHERE tenant_id=%s AND deleted_at IS NULL
         LIMIT 1
        """,
        (tenant_id,),
    )

    clinics = fetch_all(
        """
        SELECT c.clinic_id, c.tenant_id, c.clinic_code, c.name, c.status,
               uc.role_code, uc.active_flag
          FROM user_clinic uc
          JOIN clinic c ON c.clinic_id = uc.clinic_id AND c.tenant_id = uc.tenant_id
         WHERE uc.user_id=%s
           AND uc.tenant_id=%s
           AND uc.active_flag=1
           AND c.deleted_at IS NULL
         ORDER BY c.name ASC
        """,
        (ua["user_id"], tenant_id),
    )

    sub, plan = _get_subscription_and_plan(int(tenant_id))
    limits = get_active_plan_limits(int(tenant_id))
    usage = get_usage(int(tenant_id))
    computed = _compute_usage_metrics(usage, limits)

    response["tenant"] = tenant_row
    response["clinics"] = clinics
    response["subscription"] = _compute_subscription_snapshot(sub, plan)
    response["limits"] = limits
    response["usage"] = usage
    response["computed"] = computed

    return jsonify(response)
