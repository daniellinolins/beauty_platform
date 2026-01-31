import json
from flask import Blueprint, request, jsonify

from db import fetch_one, execute, execute_no_return

bp_submissions = Blueprint("submissions", __name__)


def _json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


@bp_submissions.post("/api/form-submissions")
def create_submission():
    data = request.get_json(force=True) or {}

    required = ["tenant_id", "clinic_id", "client_id", "id_form", "id_form_version"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        return jsonify({"message": f"Missing: {', '.join(missing)}"}), 400

    tenant_id = int(data["tenant_id"])
    clinic_id = int(data["clinic_id"])
    client_id = int(data["client_id"])
    id_form = int(data["id_form"])
    id_form_version = int(data["id_form_version"])

    # relação client_clinic precisa existir e estar ativa
    cc = fetch_one("""
        SELECT client_clinic_id
        FROM client_clinic
        WHERE tenant_id = %(tenant_id)s
          AND clinic_id = %(clinic_id)s
          AND client_id = %(client_id)s
          AND status = 'ACTIVE'
          AND deleted_at IS NULL
        LIMIT 1
    """, {"tenant_id": tenant_id, "clinic_id": clinic_id, "client_id": client_id})

    if not cc:
        return jsonify({
            "message": "Client is not ACTIVE for this clinic (client_clinic not found/active).",
            "hint": "Crie/ative o vínculo em client_clinic antes de criar a submissão."
        }), 409

    client_clinic_id = cc["client_clinic_id"]

    # buscar a versão (e validar tenant + form)
    fv = fetch_one("""
        SELECT schema_json, status
        FROM form_version
        WHERE id_form_version = %(id_form_version)s
          AND tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        LIMIT 1
    """, {"id_form_version": id_form_version, "tenant_id": tenant_id, "id_form": id_form})

    if not fv:
        return jsonify({"message": "form_version not found for this tenant/form"}), 404

    if fv.get("status") != "PUBLISHED":
        return jsonify({"message": "form_version must be PUBLISHED to create submissions"}), 400

    # MariaDB-safe: salvar JSON como string
    snapshot_schema_str = _json_dumps(fv["schema_json"])

    new_id = execute("""
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
          snapshot_schema_json
        )
        VALUES
        (
          %(tenant_id)s,
          %(id_form)s,
          %(id_form_version)s,
          %(clinic_id)s,
          %(client_id)s,
          %(client_clinic_id)s,
          'DRAFT',
          '{}',
          %(snapshot_schema_json)s
        )
    """, {
        "tenant_id": tenant_id,
        "id_form": id_form,
        "id_form_version": id_form_version,
        "clinic_id": clinic_id,
        "client_id": client_id,
        "client_clinic_id": client_clinic_id,
        "snapshot_schema_json": snapshot_schema_str
    })

    row = fetch_one("""
        SELECT *
        FROM form_submission
        WHERE id_form_submission = %(id)s
          AND tenant_id = %(tenant_id)s
          AND deleted_at IS NULL
    """, {"id": new_id, "tenant_id": tenant_id})

    return jsonify(row), 201


@bp_submissions.put("/api/form-submissions/<int:id_form_submission>/payload")
def save_payload(id_form_submission: int):
    data = request.get_json(force=True) or {}

    tenant_id = data.get("tenant_id")
    payload_json = data.get("payload_json")

    if not tenant_id:
        return jsonify({"message": "tenant_id is required"}), 400
    if payload_json is None:
        return jsonify({"message": "payload_json is required"}), 400

    tenant_id = int(tenant_id)

    existing = fetch_one("""
        SELECT id_form_submission, status
        FROM form_submission
        WHERE id_form_submission = %(id)s
          AND tenant_id = %(tenant_id)s
          AND deleted_at IS NULL
    """, {"id": id_form_submission, "tenant_id": tenant_id})

    if not existing:
        return jsonify({"message": "form_submission not found"}), 404

    if existing.get("status") == "FINAL":
        return jsonify({"message": "Cannot edit payload when submission is FINAL"}), 409

    payload_str = _json_dumps(payload_json)

    execute_no_return("""
        UPDATE form_submission
        SET payload_json = %(payload)s,
            updated_at = NOW()
        WHERE id_form_submission = %(id)s
          AND tenant_id = %(tenant_id)s
          AND deleted_at IS NULL
    """, {"payload": payload_str, "id": id_form_submission, "tenant_id": tenant_id})

    row = fetch_one("""
        SELECT *
        FROM form_submission
        WHERE id_form_submission = %(id)s
          AND tenant_id = %(tenant_id)s
          AND deleted_at IS NULL
    """, {"id": id_form_submission, "tenant_id": tenant_id})

    return jsonify(row)


@bp_submissions.post("/api/form-submissions/<int:id_form_submission>/finalize")
def finalize_submission(id_form_submission: int):
    data = request.get_json(force=True) or {}
    tenant_id = data.get("tenant_id")

    if not tenant_id:
        return jsonify({"message": "tenant_id is required"}), 400

    tenant_id = int(tenant_id)

    existing = fetch_one("""
        SELECT id_form_submission, status
        FROM form_submission
        WHERE id_form_submission = %(id)s
          AND tenant_id = %(tenant_id)s
          AND deleted_at IS NULL
    """, {"id": id_form_submission, "tenant_id": tenant_id})

    if not existing:
        return jsonify({"message": "form_submission not found"}), 404

    if existing.get("status") == "FINAL":
        row = fetch_one("""
            SELECT *
            FROM form_submission
            WHERE id_form_submission = %(id)s
              AND tenant_id = %(tenant_id)s
              AND deleted_at IS NULL
        """, {"id": id_form_submission, "tenant_id": tenant_id})
        return jsonify(row)

    execute_no_return("""
        UPDATE form_submission
        SET status = 'FINAL',
            submitted_at = NOW(),
            updated_at = NOW()
        WHERE id_form_submission = %(id)s
          AND tenant_id = %(tenant_id)s
          AND deleted_at IS NULL
    """, {"id": id_form_submission, "tenant_id": tenant_id})

    row = fetch_one("""
        SELECT *
        FROM form_submission
        WHERE id_form_submission = %(id)s
          AND tenant_id = %(tenant_id)s
          AND deleted_at IS NULL
    """, {"id": id_form_submission, "tenant_id": tenant_id})

    return jsonify(row)
