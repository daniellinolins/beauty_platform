from __future__ import annotations

from flask import Blueprint, jsonify

bp_files = Blueprint("files", __name__)


@bp_files.route("/api/files/health", methods=["GET"])
def health():
    return jsonify({"ok": True}), 200
