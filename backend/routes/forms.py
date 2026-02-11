from flask import Blueprint, request, jsonify
from db import fetch_all, fetch_one, execute, execute_no_return

bp_forms = Blueprint('forms', __name__, url_prefix='/api/forms')


def _slugify(value: str) -> str:
    import re, unicodedata
    value = (value or '').strip()
    value = unicodedata.normalize('NFKD', value)
    value = value.encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^a-zA-Z0-9]+', '-', value).strip('-').lower()
    value = re.sub(r'-{2,}', '-', value)
    return value or 'form'


def _normalize_language(lang: str) -> str:
    lang = (lang or '').lower().strip()
    if lang.startswith('en'):
        return 'en'
    return 'pt'


def _generate_unique_code(tenant_id: int, name_or_code: str) -> str:
    import random, string
    base = _slugify(name_or_code)
    code = base
    i = 0
    while True:
        exists = fetch_one(
            "SELECT 1 AS ok FROM form WHERE tenant_id=%s AND code=%s LIMIT 1",
            (tenant_id, code),
        )
        if not exists:
            return code

        i += 1
        if i < 10:
            code = f"{base}-{i}"
        else:
            suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
            code = f"{base}-{suffix}"


@bp_forms.get('')
def list_forms():
    tenant_id = request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    rows = fetch_all(
        """
        SELECT id_form, tenant_id, name, description, status, default_language, code
        FROM form
        WHERE tenant_id=%s
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

    status = (data.get('status') or 'ACTIVE').upper()
    if status not in ('ACTIVE', 'INACTIVE'):
        status = 'ACTIVE'

    default_language = _normalize_language(data.get('default_language', 'pt'))

    code = (data.get('code') or '').strip()
    if not code:
        code = _generate_unique_code(int(tenant_id), str(name))
    else:
        # normaliza e garante unicidade do code informado
        code = _generate_unique_code(int(tenant_id), code)

    new_id = execute(
        """
        INSERT INTO form (tenant_id, name, description, status, default_language, code)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (tenant_id, name, description, status, default_language, code),
    )

    row = fetch_one(
        """
        SELECT id_form, tenant_id, name, description, status, default_language, code
        FROM form
        WHERE id_form=%s
        """,
        (new_id,),
    )
    return jsonify(row), 201


@bp_forms.put('/<int:form_id>')
def update_form(form_id: int):
    data = request.get_json(silent=True) or {}

    tenant_id = data.get('tenant_id')
    if not tenant_id:
        return jsonify({'error': 'tenant_id is required'}), 400

    name = data.get('name')
    description = data.get('description')
    status = (data.get('status') or 'ACTIVE').upper()
    if status not in ('ACTIVE', 'INACTIVE'):
        status = 'ACTIVE'
    default_language = _normalize_language(data.get('default_language', 'pt'))

    # code: se vier vazio, mantém o atual; se vier preenchido, normaliza e valida unicidade
    code = data.get('code')
    if code is not None:
        code = code.strip()
        if code:
            code = _generate_unique_code(int(tenant_id), code)
        else:
            code = None

    if code is None:
        execute_no_return(
            """
            UPDATE form
               SET name=%s,
                   description=%s,
                   status=%s,
                   default_language=%s
             WHERE id_form=%s AND tenant_id=%s
            """,
            (name, description, status, default_language, form_id, tenant_id),
        )
    else:
        execute_no_return(
            """
            UPDATE form
               SET name=%s,
                   description=%s,
                   status=%s,
                   default_language=%s,
                   code=%s
             WHERE id_form=%s AND tenant_id=%s
            """,
            (name, description, status, default_language, code, form_id, tenant_id),
        )

    row = fetch_one(
        "SELECT id_form, tenant_id, name, description, status, default_language, code FROM form WHERE id_form=%s",
        (form_id,),
    )
    return jsonify(row)
