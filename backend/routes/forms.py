from flask import Blueprint, jsonify, request
from db import fetch_all, fetch_one, execute_no_return

bp_forms = Blueprint('forms', __name__, url_prefix='/api/forms')


@bp_forms.get('')
def list_forms():
    tenant_id = request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    rows = fetch_all(
        """
        SELECT
            id_form,
            name,
            description,
            status,
            default_language,
            code,
            created_at
        FROM form
        WHERE tenant_id = %s
        ORDER BY id_form DESC
        """,
        (tenant_id,),
    )
    return jsonify(rows)


@bp_forms.post('')
def create_form():
    data = request.get_json(silent=True) or {}
    tenant_id = data.get('tenant_id')
    name = data.get('name')
    if not tenant_id or not name:
        return jsonify({'error': 'tenant_id and name are required'}), 400

    description = data.get('description')
    status = data.get('status', 'ACTIVE')
    default_language = data.get('default_language', 'pt')
    code = data.get('code')

    new_id = execute_no_return(
        """
        INSERT INTO form (tenant_id, name, description, status, default_language, code)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (tenant_id, name, description, status, default_language, code),
        return_lastrowid=True,
    )

    row = fetch_one(
        "SELECT id_form, tenant_id, name, description, status, default_language, code FROM form WHERE id_form=%s",
        (new_id,),
    )
    return jsonify(row), 201


@bp_forms.put('/<int:form_id>')
def update_form(form_id: int):
    data = request.get_json(silent=True) or {}
    tenant_id = data.get('tenant_id') or request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    # Only update the provided fields
    fields = {}
    for key in ['name', 'description', 'status', 'default_language', 'code']:
        if key in data:
            fields[key] = data[key]

    if not fields:
        return jsonify({'error': 'no fields to update'}), 400

    sets = ', '.join([f"{k}=%s" for k in fields.keys()])
    params = list(fields.values()) + [form_id, tenant_id]

    execute_no_return(
        f"UPDATE form SET {sets} WHERE id_form=%s AND tenant_id=%s",
        tuple(params),
    )

    row = fetch_one(
        "SELECT id_form, tenant_id, name, description, status, default_language, code FROM form WHERE id_form=%s AND tenant_id=%s",
        (form_id, tenant_id),
    )
    if not row:
        return jsonify({'error': 'not found'}), 404

    return jsonify(row)
