from flask import Blueprint, jsonify, request
import json
from db import fetch_all, fetch_one, execute_no_return

bp_form_versions = Blueprint('form_versions', __name__, url_prefix='/api/forms')


def _schema_to_db(schema_json):
    # Store as JSON string (MySQL JSON field also accepts string)
    if schema_json is None:
        return json.dumps({})
    if isinstance(schema_json, (dict, list)):
        return json.dumps(schema_json, ensure_ascii=False)
    # assume string
    return str(schema_json)


@bp_form_versions.get('/<int:form_id>/versions')
def list_versions(form_id: int):
    tenant_id = request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    rows = fetch_all(
        """
        SELECT
            id_form_version,
            id_form,
            tenant_id,
            version_number,
            version_status,
            schema_json,
            created_at
        FROM form_version
        WHERE id_form = %s AND tenant_id = %s
        ORDER BY id_form_version DESC
        """,
        (form_id, tenant_id),
    )
    return jsonify(rows)


@bp_form_versions.get('/<int:form_id>/versions/latest')
def get_latest_version(form_id: int):
    tenant_id = request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    row = fetch_one(
        """
        SELECT
            id_form_version,
            id_form,
            tenant_id,
            version_number,
            version_status,
            schema_json,
            created_at
        FROM form_version
        WHERE id_form = %s AND tenant_id = %s
        ORDER BY id_form_version DESC
        LIMIT 1
        """,
        (form_id, tenant_id),
    )
    if not row:
        return jsonify({}), 404
    return jsonify(row)


@bp_form_versions.post('/<int:form_id>/versions')
def create_version(form_id: int):
    data = request.get_json(silent=True) or {}
    tenant_id = data.get('tenant_id') or request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    version_status = data.get('version_status', 'DRAFT')
    schema_json = _schema_to_db(data.get('schema_json'))

    # next version_number = max + 1 (simpler)
    last = fetch_one(
        "SELECT COALESCE(MAX(version_number), 0) AS mx FROM form_version WHERE id_form=%s AND tenant_id=%s",
        (form_id, tenant_id),
    )
    next_number = (last.get('mx') if last else 0) + 1

    new_id = execute_no_return(
        """
        INSERT INTO form_version (id_form, tenant_id, version_number, version_status, schema_json)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (form_id, tenant_id, next_number, version_status, schema_json),
        return_lastrowid=True,
    )

    row = fetch_one(
        """SELECT id_form_version, id_form, tenant_id, version_number, version_status, schema_json, created_at
            FROM form_version WHERE id_form_version=%s""",
        (new_id,),
    )
    return jsonify(row), 201


@bp_form_versions.put('/<int:form_id>/versions/<int:version_id>')
def update_version(form_id: int, version_id: int):
    data = request.get_json(silent=True) or {}
    tenant_id = data.get('tenant_id') or request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    fields = {}
    if 'version_status' in data:
        fields['version_status'] = data.get('version_status')
    if 'schema_json' in data:
        fields['schema_json'] = _schema_to_db(data.get('schema_json'))

    if not fields:
        return jsonify({'error': 'no fields to update'}), 400

    sets = ', '.join([f"{k}=%s" for k in fields.keys()])
    params = list(fields.values()) + [form_id, version_id, tenant_id]

    execute_no_return(
        f"UPDATE form_version SET {sets} WHERE id_form=%s AND id_form_version=%s AND tenant_id=%s",
        tuple(params),
    )

    row = fetch_one(
        """SELECT id_form_version, id_form, tenant_id, version_number, version_status, schema_json, created_at
            FROM form_version WHERE id_form=%s AND id_form_version=%s AND tenant_id=%s""",
        (form_id, version_id, tenant_id),
    )
    if not row:
        return jsonify({'error': 'not found'}), 404
    return jsonify(row)


@bp_form_versions.post('/<int:form_id>/versions/<int:version_id>/publish')
def publish_version(form_id: int, version_id: int):
    data = request.get_json(silent=True) or {}
    tenant_id = data.get('tenant_id') or request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    execute_no_return(
        "UPDATE form_version SET version_status='PUBLISHED' WHERE id_form=%s AND id_form_version=%s AND tenant_id=%s",
        (form_id, version_id, tenant_id),
    )

    row = fetch_one(
        """SELECT id_form_version, id_form, tenant_id, version_number, version_status, schema_json, created_at
            FROM form_version WHERE id_form=%s AND id_form_version=%s AND tenant_id=%s""",
        (form_id, version_id, tenant_id),
    )
    if not row:
        return jsonify({'error': 'not found'}), 404

    return jsonify(row)
