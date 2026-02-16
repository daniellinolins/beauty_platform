import os
import mimetypes
import hashlib
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename

from db import fetch_one, execute, execute_no_return

bp_files = Blueprint("files", __name__, url_prefix="/api/files")

# Ajuste se quiser outro nome
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


def get_client_ip():
    # Se no futuro você usar proxy/reverse-proxy, pode ler X-Forwarded-For aqui
    return request.headers.get("X-Forwarded-For", request.remote_addr)


def tenant_storage_paths(tenant_id: int, category: str):
    tenant_dir = os.path.join(BASE_STORAGE_DIR, f"tenant_{tenant_id}")
    category_dir = os.path.join(tenant_dir, category)
    ensure_dir(category_dir)
    return tenant_dir, category_dir


@bp_files.route("", methods=["POST"])
@bp_files.route("/upload", methods=["POST"])
def upload_file():
    """
    multipart/form-data:
      - tenant_id: int (obrigatório)
      - category: signatures|photos|pdfs (opcional; default=photos)
      - purpose: SIGNATURE|ID_DOCUMENT|TREATMENT_AREA... (opcional)
      - file: binário (obrigatório)
    """
    tenant_id = request.form.get("tenant_id", type=int)
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    category = request.form.get("category", "photos").strip().lower()
    if category not in ("photos", "signatures", "pdfs", "drawings"):
        category = "photos"

    purpose = (request.form.get("purpose") or "").strip()

    if "file" not in request.files:
        return jsonify({"error": "file is required"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "file filename is empty"}), 400

    original_name = secure_filename(f.filename)

    # Descobrir mime
    mime_type = f.mimetype or mimetypes.guess_type(original_name)[0] or "application/octet-stream"

    # Criar nome único (timestamp + hash parcial)
    # Salva primeiro em temp, calcula sha e renomeia
    _, category_dir = tenant_storage_paths(tenant_id, category)

    temp_path = os.path.join(category_dir, f"upload_{datetime.utcnow().timestamp()}_{original_name}")
    f.save(temp_path)

    size_bytes = os.path.getsize(temp_path)
    sha = sha256_file(temp_path)

    # Nome final: sha + extensão
    _, ext = os.path.splitext(original_name)
    if not ext:
        # tenta derivar pelo mime
        ext = mimetypes.guess_extension(mime_type) or ""

    final_name = f"{sha}{ext}"
    final_path = os.path.join(category_dir, final_name)

    # Se já existe, remove temp e reutiliza
    if os.path.exists(final_path):
        try:
            os.remove(temp_path)
        except:
            pass
    else:
        os.replace(temp_path, final_path)

    # storage_path no banco: caminho relativo para ficar portável
    # exemplo: tenant_1/signatures/<sha>.png
    rel_path = os.path.relpath(final_path, BASE_STORAGE_DIR).replace("\\", "/")

    new_id = execute(
        """
        INSERT INTO file_object
        (tenant_id, storage_provider, storage_path, original_name, mime_type, size_bytes, sha256, created_at, created_by)
        VALUES
        (%(tenant_id)s, 'LOCAL', %(storage_path)s, %(original_name)s, %(mime_type)s, %(size_bytes)s, %(sha256)s, NOW(), NULL)
        """,
        {
            "tenant_id": tenant_id,
            "storage_path": rel_path,
            "original_name": original_name,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "sha256": sha,
        },
    )

    return jsonify(
        {
            "id_file_object": new_id,
            "tenant_id": tenant_id,
            "storage_path": rel_path,
            "original_name": original_name,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "sha256": sha,
            "ip": get_client_ip(),
            "signed_at_utc": utc_now_iso(),  # útil para assinatura
            "purpose": purpose,
            "category": category,
        }
    ), 201


@bp_files.route("/<int:file_id>", methods=["GET"])
def download_file(file_id: int):
    tenant_id = request.args.get("tenant_id", type=int)
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    row = fetch_one(
        """
        SELECT id_file_object, tenant_id, storage_path, original_name, mime_type, deleted_at
        FROM file_object
        WHERE id_file_object = %(id)s AND tenant_id = %(tenant_id)s
        """,
        {"id": file_id, "tenant_id": tenant_id},
    )

    if not row or row.get("deleted_at") is not None:
        return jsonify({"error": "file not found"}), 404

    storage_path = row["storage_path"]
    abs_path = os.path.join(BASE_STORAGE_DIR, storage_path.replace("/", os.sep))

    if not os.path.exists(abs_path):
        return jsonify({"error": "file missing on disk"}), 404

    return send_file(
        abs_path,
        mimetype=row.get("mime_type") or "application/octet-stream",
        as_attachment=False,
        download_name=row.get("original_name") or f"file_{file_id}",
        max_age=0,
    )
