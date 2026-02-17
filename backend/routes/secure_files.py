import os
import mimetypes
import hashlib
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename

from db import fetch_one, execute, transaction, execute_in_tx
from routes.middlewares import tenant_subscription_required
from limits import check_limits, apply_usage_delta

bp_secure_files = Blueprint("secure_files", __name__, url_prefix="/api/secure/files")

BASE_STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "storage")


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def tenant_storage_paths(tenant_id: int, category: str):
    tenant_dir = os.path.join(BASE_STORAGE_DIR, f"tenant_{tenant_id}")
    category_dir = os.path.join(tenant_dir, category)
    ensure_dir(category_dir)
    return tenant_dir, category_dir


def _user_has_access_to_clinic(tenant_id: int, user_id: int, clinic_id: int) -> bool:
    """
    Clinic must belong to tenant and user must have an active user_clinic row.
    """
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


@bp_secure_files.post("/upload")
@tenant_subscription_required
def secure_upload_file():
    """
    multipart/form-data:
      - clinic_id: int (obrigatório)
      - category: photos|signatures|pdfs|drawings (opcional; default=photos)
      - purpose: ... (opcional)
      - file: binário (obrigatório)

    tenant_id vem do token.
    """
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    clinic_id = request.form.get("clinic_id", type=int)
    if not clinic_id:
        return jsonify({"error": "clinic_id is required"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, int(clinic_id)):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    category = (request.form.get("category", "photos") or "photos").strip().lower()
    if category not in ("photos", "signatures", "pdfs", "drawings"):
        category = "photos"

    purpose = (request.form.get("purpose") or "").strip()

    if "file" not in request.files:
        return jsonify({"error": "file is required"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "file filename is empty"}), 400

    original_name = secure_filename(f.filename)
    mime_type = f.mimetype or mimetypes.guess_type(original_name)[0] or "application/octet-stream"

    _, category_dir = tenant_storage_paths(tenant_id, category)

    temp_path = os.path.join(category_dir, f"upload_{datetime.utcnow().timestamp()}_{original_name}")
    f.save(temp_path)

    try:
        size_bytes = os.path.getsize(temp_path)

        # ✅ LIMIT CHECK (storage) before finalizing
        ok, payload = check_limits(tenant_id, inc_storage_bytes=size_bytes)
        if not ok:
            try:
                os.remove(temp_path)
            except Exception:
                pass
            return jsonify(payload), 402

        sha = sha256_file(temp_path)

        _, ext = os.path.splitext(original_name)
        if not ext:
            ext = mimetypes.guess_extension(mime_type) or ""

        final_name = f"{sha}{ext}"
        final_path = os.path.join(category_dir, final_name)

        if os.path.exists(final_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        else:
            os.replace(temp_path, final_path)

        rel_path = os.path.relpath(final_path, BASE_STORAGE_DIR).replace("\\", "/")

        # grava metadados no banco
        with transaction() as (conn, cur):
            new_id = execute_in_tx(
                cur,
                """
                INSERT INTO file_object
                  (tenant_id, storage_provider, storage_path, original_name, mime_type,
                   size_bytes, sha256, created_at, created_by)
                VALUES
                  (%s, 'LOCAL', %s, %s, %s,
                   %s, %s, NOW(), %s)
                """,
                (tenant_id, rel_path, original_name, mime_type, size_bytes, sha, user_id),
            )

        # ✅ Apply usage delta after success
        apply_usage_delta(tenant_id, inc_storage_bytes=size_bytes)

        return jsonify(
            {
                "id_file_object": new_id,
                "tenant_id": tenant_id,
                "clinic_id": int(clinic_id),
                "storage_path": rel_path,
                "original_name": original_name,
                "mime_type": mime_type,
                "size_bytes": size_bytes,
                "sha256": sha,
                "created_by": user_id,
                "created_at_utc": utc_now_iso(),
                "purpose": purpose,
                "category": category,
            }
        ), 201

    except Exception:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass
        raise
