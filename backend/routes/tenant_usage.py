from flask import Blueprint, jsonify, g
from routes.middlewares import auth_required
from limits import get_usage, get_active_plan_limits


bp_tenant_usage = Blueprint("tenant_usage", __name__, url_prefix="/api/tenant")


@bp_tenant_usage.get("/usage")
@auth_required
def tenant_usage():
    tenant_id = g.user.get("tenant_id")
    if not tenant_id:
        return jsonify({"error": "missing_tenant_in_token"}), 400

    usage = get_usage(int(tenant_id))
    limits = get_active_plan_limits(int(tenant_id))

    return jsonify({"usage": usage, "limits": limits})
