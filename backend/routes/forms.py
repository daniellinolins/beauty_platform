from flask import Blueprint, request, jsonify, g
from datetime import datetime
import re

from db import fetch_all, fetch_one, execute_no_return
from routes.middlewares import tenant_subscription_required

# -----------------------------
# Legacy endpoints (kept as-is)
# -----------------------------
bp_forms = Blueprint('forms', __name__, url_prefix='/api/forms')


def _slug_code(name: str) -> str:
    base = (name or "").strip().lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    if not base:
        base = "form"
    suffix = datetime.utcnow().strftime("%y%m%d%H%M%S")
    code = f"{base}-{suffix}"
    return code[:60]


def _slugify(value: str) -> str:
    import unicodedata
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
        '''
        SELECT id_form, tenant_id, name, description, status, default_language, code
        FROM form
        WHERE tenant_id=%s
        ORDER BY id_form DESC
        ''',
        (tenant_id,),
    )
    return jsonify(rows)


@bp_forms.post('')
def create_form():
    data = request.get_json(force=True) or {}

    tenant_id = data.get("tenant_id")
    name = (data.get("name") or "").strip()
    description = data.get("description")
    status = data.get("status") or "ACTIVE"
    default_language = data.get("default_language") or "pt-PT"

    code = (data.get("code") or "").strip()
    if not code:
        code = _slug_code(name)

    sql = '''
        INSERT INTO form (tenant_id, code, name, description, status, default_language)
        VALUES (%(tenant_id)s, %(code)s, %(name)s, %(description)s, %(status)s, %(default_language)s)
    '''

    new_id = execute_no_return(
        sql,
        {
            "tenant_id": tenant_id,
            "code": code,
            "name": name,
            "description": description,
            "status": status,
            "default_language": default_language,
        },
        return_lastrowid=True,
    )

    return jsonify({"id_form": new_id, "tenant_id": tenant_id, "code": code}), 201


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

    code = data.get('code')
    if code is not None:
        code = code.strip()
        if code:
            code = _generate_unique_code(int(tenant_id), code)
        else:
            code = None

    if code is None:
        execute_no_return(
            '''
            UPDATE form
               SET name=%s,
                   description=%s,
                   status=%s,
                   default_language=%s
             WHERE id_form=%s AND tenant_id=%s
            ''',
            (name, description, status, default_language, form_id, tenant_id),
        )
    else:
        execute_no_return(
            '''
            UPDATE form
               SET name=%s,
                   description=%s,
                   status=%s,
                   default_language=%s,
                   code=%s
             WHERE id_form=%s AND tenant_id=%s
            ''',
            (name, description, status, default_language, code, form_id, tenant_id),
        )

    row = fetch_one(
        "SELECT id_form, tenant_id, name, description, status, default_language, code FROM form WHERE id_form=%s",
        (form_id,),
    )
    return jsonify(row)


# -----------------------------
# Secure endpoints (new)
# -----------------------------
bp_secure_forms = Blueprint('secure_forms', __name__, url_prefix='/api/secure/forms')


def _require_clinic_id_from_request():
    clinic_id = request.args.get("clinic_id")
    if clinic_id is not None:
        try:
            return int(clinic_id)
        except Exception:
            return None

    data = request.get_json(silent=True) or {}
    if "clinic_id" in data:
        try:
            return int(data.get("clinic_id"))
        except Exception:
            return None

    return None


def _user_has_access_to_clinic(tenant_id: int, user_id: int, clinic_id: int) -> bool:
    row = fetch_one(
        '''
        SELECT 1
          FROM clinic c
          JOIN user_clinic uc
            ON uc.clinic_id = c.clinic_id
           AND uc.user_id = %s
           AND uc.tenant_id = c.tenant_id
           AND uc.active_flag = 1
         WHERE c.tenant_id = %s
           AND c.clinic_id = %s
           AND c.deleted_at IS NULL
         LIMIT 1
        ''',
        (user_id, tenant_id, clinic_id),
    )
    return row is not None


@bp_secure_forms.get('')
@tenant_subscription_required
def secure_list_forms():
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    # NOTE: form is tenant-scoped (no clinic_id column), so returns all tenant forms.
    rows = fetch_all(
        '''
        SELECT id_form, tenant_id, name, description, status, default_language, code
          FROM form
         WHERE tenant_id=%s
         ORDER BY id_form DESC
        ''',
        (tenant_id,),
    )
    return jsonify(rows)


@bp_secure_forms.post('')
@tenant_subscription_required
def secure_create_form():
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    data = request.get_json(force=True) or {}

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name_is_required"}), 400

    description = data.get("description")
    status = (data.get("status") or "ACTIVE").upper()
    if status not in ("ACTIVE", "INACTIVE"):
        status = "ACTIVE"

    default_language = data.get("default_language") or "pt-PT"

    code = (data.get("code") or "").strip()
    if not code:
        code = _slug_code(name)
    else:
        code = _generate_unique_code(tenant_id, code)

    new_id = execute_no_return(
        '''
        INSERT INTO form (tenant_id, code, name, description, status, default_language)
        VALUES (%s, %s, %s, %s, %s, %s)
        ''',
        (tenant_id, code, name, description, status, default_language),
        return_lastrowid=True,
    )

    return jsonify({"id_form": new_id, "tenant_id": tenant_id, "code": code}), 201


@bp_secure_forms.put('/<int:form_id>')
@tenant_subscription_required
def secure_update_form(form_id: int):
    tenant_id = int(g.user["tenant_id"])
    user_id = int(g.user["user_id"])

    data = request.get_json(silent=True) or {}

    clinic_id = _require_clinic_id_from_request()
    if not clinic_id:
        return jsonify({"error": "missing_or_invalid_clinic_id"}), 400

    if not _user_has_access_to_clinic(tenant_id, user_id, clinic_id):
        return jsonify({"error": "forbidden_clinic_access"}), 403

    exists = fetch_one(
        "SELECT 1 AS ok FROM form WHERE id_form=%s AND tenant_id=%s LIMIT 1",
        (form_id, tenant_id),
    )
    if not exists:
        return jsonify({"error": "form_not_found"}), 404

    name = data.get('name')
    description = data.get('description')
    status = (data.get('status') or 'ACTIVE').upper()
    if status not in ('ACTIVE', 'INACTIVE'):
        status = 'ACTIVE'
    default_language = data.get('default_language', 'pt-PT')

    code = data.get('code')
    if code is not None:
        code = (code or '').strip()
        if code:
            code = _generate_unique_code(tenant_id, code)
        else:
            code = None

    if code is None:
        execute_no_return(
            '''
            UPDATE form
               SET name=%s,
                   description=%s,
                   status=%s,
                   default_language=%s
             WHERE id_form=%s AND tenant_id=%s
            ''',
            (name, description, status, default_language, form_id, tenant_id),
        )
    else:
        execute_no_return(
            '''
            UPDATE form
               SET name=%s,
                   description=%s,
                   status=%s,
                   default_language=%s,
                   code=%s
             WHERE id_form=%s AND tenant_id=%s
            ''',
            (name, description, status, default_language, code, form_id, tenant_id),
        )

    row = fetch_one(
        "SELECT id_form, tenant_id, name, description, status, default_language, code FROM form WHERE id_form=%s AND tenant_id=%s",
        (form_id, tenant_id),
    )
    return jsonify(row)
