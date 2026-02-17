from datetime import datetime
from db import fetch_one, transaction, execute_in_tx

BYTES_PER_MB = 1024 * 1024


def _month_key(now=None) -> str:
    now = now or datetime.utcnow()
    return now.strftime("%Y-%m")


def get_active_plan_limits(tenant_id: int) -> dict | None:
    """
    Returns dict with limits:
      max_forms, max_clients, max_submissions_month, max_storage_mb
    """
    row = fetch_one(
        """
        SELECT p.max_forms,
               p.max_clients,
               p.max_submissions_month,
               p.max_storage_mb
          FROM tenant_subscription s
          JOIN subscription_plan p ON p.plan_id = s.plan_id
         WHERE s.tenant_id = %s
           AND s.deleted_at IS NULL
           AND p.deleted_at IS NULL
         ORDER BY s.tenant_subscription_id DESC
         LIMIT 1
        """,
        (tenant_id,),
    )
    return row


def ensure_usage_row(tenant_id: int):
    """
    Ensure tenant_usage exists for tenant_id.
    """
    now = datetime.utcnow()
    mk = _month_key(now)

    with transaction() as (conn, cur):
        existing = fetch_one(
            "SELECT tenant_id, month_key FROM tenant_usage WHERE tenant_id=%s LIMIT 1",
            (tenant_id,),
        )
        if not existing:
            execute_in_tx(
                cur,
                """
                INSERT INTO tenant_usage
                  (tenant_id, month_key, submissions_count_month, storage_used_bytes, forms_count, clients_count, updated_at)
                VALUES
                  (%s, %s, 0, 0, 0, 0, %s)
                """,
                (tenant_id, mk, now),
            )
        else:
            # month rollover for submissions_count_month
            if existing["month_key"] != mk:
                execute_in_tx(
                    cur,
                    """
                    UPDATE tenant_usage
                       SET month_key=%s,
                           submissions_count_month=0,
                           updated_at=%s
                     WHERE tenant_id=%s
                    """,
                    (mk, now, tenant_id),
                )


def get_usage(tenant_id: int) -> dict:
    ensure_usage_row(tenant_id)
    row = fetch_one(
        """
        SELECT tenant_id, month_key, submissions_count_month,
               storage_used_bytes, forms_count, clients_count, updated_at
          FROM tenant_usage
         WHERE tenant_id=%s
         LIMIT 1
        """,
        (tenant_id,),
    )
    return row


def _limit_exceeded(current: int, inc: int, limit: int) -> bool:
    if limit is None:
        return False
    if int(limit) <= 0:
        return False  # unlimited
    return (int(current) + int(inc)) > int(limit)


def check_limits(
    tenant_id: int,
    inc_forms: int = 0,
    inc_clients: int = 0,
    inc_submissions: int = 0,
    inc_storage_bytes: int = 0,
) -> tuple[bool, dict]:
    """
    Returns (ok, payload). If not ok, payload has {"error": "...", "details": {...}}
    """
    limits = get_active_plan_limits(tenant_id)
    if not limits:
        # If no subscription exists, block by default (safer). You can change to allow.
        return False, {"error": "subscription_not_found"}

    usage = get_usage(tenant_id)

    # forms
    if _limit_exceeded(usage["forms_count"], inc_forms, limits["max_forms"]):
        return False, {
            "error": "limit_forms_exceeded",
            "details": {"current": usage["forms_count"], "attempt": inc_forms, "max": limits["max_forms"]},
        }

    # clients
    if _limit_exceeded(usage["clients_count"], inc_clients, limits["max_clients"]):
        return False, {
            "error": "limit_clients_exceeded",
            "details": {"current": usage["clients_count"], "attempt": inc_clients, "max": limits["max_clients"]},
        }

    # submissions / month
    if _limit_exceeded(usage["submissions_count_month"], inc_submissions, limits["max_submissions_month"]):
        return False, {
            "error": "limit_submissions_month_exceeded",
            "details": {
                "month_key": usage["month_key"],
                "current": usage["submissions_count_month"],
                "attempt": inc_submissions,
                "max": limits["max_submissions_month"],
            },
        }

    # storage bytes (plan has MB)
    max_storage_mb = limits["max_storage_mb"]
    if max_storage_mb is not None and int(max_storage_mb) > 0:
        max_bytes = int(max_storage_mb) * BYTES_PER_MB
        if (int(usage["storage_used_bytes"]) + int(inc_storage_bytes)) > max_bytes:
            return False, {
                "error": "limit_storage_exceeded",
                "details": {
                    "current_bytes": int(usage["storage_used_bytes"]),
                    "attempt_bytes": int(inc_storage_bytes),
                    "max_bytes": int(max_bytes),
                    "max_storage_mb": int(max_storage_mb),
                },
            }

    return True, {"ok": True, "usage": usage, "limits": limits}


def apply_usage_delta(
    tenant_id: int,
    inc_forms: int = 0,
    inc_clients: int = 0,
    inc_submissions: int = 0,
    inc_storage_bytes: int = 0,
):
    """
    Apply deltas atomically (assumes operation already succeeded).
    """
    ensure_usage_row(tenant_id)
    now = datetime.utcnow()

    fields = []
    params = []

    if inc_forms:
        fields.append("forms_count = forms_count + %s")
        params.append(int(inc_forms))

    if inc_clients:
        fields.append("clients_count = clients_count + %s")
        params.append(int(inc_clients))

    if inc_submissions:
        fields.append("submissions_count_month = submissions_count_month + %s")
        params.append(int(inc_submissions))

    if inc_storage_bytes:
        fields.append("storage_used_bytes = storage_used_bytes + %s")
        params.append(int(inc_storage_bytes))

    fields.append("updated_at = %s")
    params.append(now)

    if not fields:
        return

    params.append(tenant_id)

    sql = f"""
        UPDATE tenant_usage
           SET {", ".join(fields)}
         WHERE tenant_id = %s
    """

    with transaction() as (conn, cur):
        execute_in_tx(cur, sql, tuple(params))
