from flask import Blueprint, jsonify, request, g
from db import fetch_all, execute_no_return
from routes.middlewares import auth_required

bp_notif = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@bp_notif.get("")
@auth_required
def list_notifications():
    user_id = g.user["user_id"]
    limit = int(request.args.get("limit", 50))

    items = fetch_all(
        """
        SELECT notification_id, title, message, type, channel, meta_json, sent_at, read_at
          FROM notification
         WHERE user_id=%s AND deleted_at IS NULL
         ORDER BY sent_at DESC
         LIMIT %s
        """,
        (user_id, limit),
    )

    return jsonify({"items": items})


@bp_notif.post("/read")
@auth_required
def mark_read():
    data = request.get_json(force=True)
    notification_id = data.get("notification_id")
    if not notification_id:
        return jsonify({"error": "missing_notification_id"}), 400

    user_id = g.user["user_id"]
    execute_no_return(
        """
        UPDATE notification
           SET read_at=NOW()
         WHERE notification_id=%s AND user_id=%s
        """,
        (notification_id, user_id),
    )
    return jsonify({"ok": True})
