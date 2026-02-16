from functools import wraps
from datetime import datetime
from flask import request, jsonify, g

from db import fetch_one
from utils.security import decode_jwt


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
      - allow if tenant has subscription TRIAL(not expired) or ACTIVE
    """

    @wraps(fn)
    @auth_required
    def wrapper(*args, **kwargs):
        user = g.user
        tenant_id = user.get("tenant_id")
        user_type = user.get("user_type")

        if user_type == "CLIENT":
            return jsonify({"error": "forbidden_for_client"}), 403

        if not tenant_id:
            return jsonify({"error": "missing_tenant"}), 400

        sub = fetch_one(
            """
            SELECT status, trial_end_at, current_period_end
              FROM tenant_subscription
             WHERE tenant_id = %s
               AND deleted_at IS NULL
             ORDER BY tenant_subscription_id DESC
             LIMIT 1
            """,
            (tenant_id,),
        )

        if not sub:
            return jsonify({"error": "subscription_not_found"}), 403

        status = sub["status"]
        now = datetime.utcnow()

        if status == "ACTIVE":
            return fn(*args, **kwargs)

        if status == "TRIAL":
            end = sub["trial_end_at"]
            if end and now <= end:
                return fn(*args, **kwargs)
            return jsonify({"error": "trial_expired"}), 402

        return jsonify({"error": "subscription_blocked", "status": status}), 402

    return wrapper
