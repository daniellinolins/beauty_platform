from functools import wraps
from datetime import datetime
from flask import request, jsonify, g

from db import fetch_one
from utils.security import decode_jwt


def _subscription_guard_or_payload(tenant_id: int):
    """
    Returns (ok: bool, payload: dict)
    ok=True  -> subscription is ACTIVE or valid TRIAL
    ok=False -> subscription invalid/expired and payload explains why
    """
    sub = fetch_one(
        """
        SELECT tenant_subscription_id, tenant_id, plan_id, status, trial_start_at, trial_end_at
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
    now = datetime.utcnow()

    # Normalize TRIAL expiration
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
        return True, {
            "ok": True,
            "subscription_status": "TRIAL",
            "trial_end_at": trial_end.isoformat() if trial_end else None,
            "plan_id": sub.get("plan_id"),
        }

    if status == "ACTIVE":
        return True, {"ok": True, "subscription_status": "ACTIVE", "plan_id": sub.get("plan_id")}

    # Any other status => block
    return False, {
        "error": "subscription_inactive",
        "subscription": {
            "status": status,
            "trial_end_at": trial_end.isoformat() if trial_end else None,
            "plan_id": sub.get("plan_id"),
        },
    }


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "missing_token"}), 401

        token = auth.split(" ", 1)[1].strip()
        try:
            payload = decode_jwt(token)
        except Exception:
            return jsonify({"error": "invalid_token"}), 401

        g.user = payload
        return fn(*args, **kwargs)

    return wrapper


def tenant_subscription_required(fn):
    """
    For clinic/tenant routes:
      - deny CLIENT
      - allow if tenant has subscription TRIAL (not expired) or ACTIVE
      - block otherwise with 402 and a clear reason
    """

    @wraps(fn)
    @auth_required
    def wrapper(*args, **kwargs):
        user = g.user or {}
        tenant_id = user.get("tenant_id")
        user_type = user.get("user_type")

        if user_type == "CLIENT":
            return jsonify({"error": "forbidden_for_client"}), 403

        if not tenant_id:
            return jsonify({"error": "missing_tenant"}), 400

        ok, payload = _subscription_guard_or_payload(int(tenant_id))
        if not ok:
            # 402 para UI poder direcionar para upgrade/renovação
            return jsonify(payload), 402

        return fn(*args, **kwargs)

    return wrapper
