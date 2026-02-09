from flask import Blueprint, request, jsonify
from db import fetch_all, fetch_one, execute

import re
from datetime import datetime

bp_forms = Blueprint("forms", __name__)


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------
def slugify(value: str) -> str:
    """
    Gera um código URL-safe a partir do texto.
    Ex.: "Ficha Avaliação Inicial" -> "ficha-avaliacao-inicial"
    """
    value = (value or "").strip().lower()

    # remove caracteres especiais (mantém letras/números/underscore/espaço/hífen)
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE)

    # espaços/underscores/hífens repetidos -> hífen único
    value = re.sub(r"[\s_-]+", "-", value)

    # remove hífens no começo/fim
    value = re.sub(r"^-+|-+$", "", value)

    # fallback
    if not value:
        value = f"form-{int(datetime.utcnow().timestamp())}"

    return value


def ensure_unique_form_code(fetch_one_fn, tenant_id: int, base_code: str) -> str:
    """
    Garante unicidade do code por tenant.
    Se já existir, vira base_code-2, base_code-3, etc.
    """
    code = base_code
    i = 2

    while True:
        row = fetch_one_fn(
            """
            SELECT id_form
            FROM form
            WHERE tenant_id = %(tenant_id)s
              AND code = %(code)s
              AND deleted_at IS NULL
            LIMIT 1
            """,
            {"tenant_id": tenant_id, "code": code},
        )

        if not row:
            return code

        code = f"{base_code}-{i}"
        i += 1


# ---------------------------------------------------------------------
# Endpoints existentes (mantidos)
# ---------------------------------------------------------------------
@bp_forms.get("/api/forms")
def list_forms():
    tenant_id = request.args.get("tenant_id", type=int)
    if not tenant_id:
        return jsonify({"message": "tenant_id is required"}), 400

    rows = fetch_all(
        """
        SELECT
          id_form, code, name, description, status, default_language
        FROM form
        WHERE tenant_id = %(tenant_id)s
          AND status = 'ACTIVE'
          AND deleted_at IS NULL
        ORDER BY name
        """,
        {"tenant_id": tenant_id},
    )

    return jsonify(rows)


@bp_forms.get("/api/forms/<int:idForm>/versions/latest")
def get_latest_published_version(idForm: int):
    tenant_id = request.args.get("tenant_id", type=int)
    if not tenant_id:
        return jsonify({"message": "tenant_id is required"}), 400

    row = fetch_one(
        """
        SELECT
          id_form_version,
          version_number,
          status,
          schema_json
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND status = 'PUBLISHED'
          AND deleted_at IS NULL
        ORDER BY version_number DESC
        LIMIT 1
        """,
        {"tenant_id": tenant_id, "id_form": idForm},
    )

    if not row:
        return jsonify({"message": "No published version found for this form"}), 404

    return jsonify(row)


# ---------------------------------------------------------------------
# NOVO: CREATE FORM (corrige code NOT NULL)
# ---------------------------------------------------------------------
@bp_forms.post("/api/forms")
def create_form():
    data = request.get_json(silent=True) or {}

    tenant_id = data.get("tenant_id")
    if tenant_id is None:
        # Mantém compatível com teu padrão atual (tenant obrigatorio no list/latest),
        # mas aqui damos fallback pra 1 se não vier (caso o front ainda não mande).
        tenant_id = 1
    tenant_id = int(tenant_id)

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"message": "name is required"}), 400

    description = data.get("description") or ""
    status = (data.get("status") or "ACTIVE").strip()  # ACTIVE/INACTIVE etc.
    default_language = (data.get("default_language") or "pt-PT").strip()

    # ✅ code: se vier do front, usa; se não, gera do name
    requested_code = (data.get("code") or "").strip()
    base_code = slugify(requested_code if requested_code else name)

    # ✅ garante que não colide por tenant
    code = ensure_unique_form_code(fetch_one, tenant_id, base_code)

    # ✅ Insere apenas colunas "seguras" (as mesmas do SELECT),
    # evitando quebrar se created_at tiver default ou nome diferente.
    new_id = execute(
        """
        INSERT INTO form (tenant_id, code, name, description, status, default_language)
        VALUES (%(tenant_id)s, %(code)s, %(name)s, %(description)s, %(status)s, %(default_language)s)
        """,
        {
            "tenant_id": tenant_id,
            "code": code,
            "name": name,
            "description": description,
            "status": status,
            "default_language": default_language,
        },
    )

    return (
        jsonify(
            {
                "id_form": new_id,
                "tenant_id": tenant_id,
                "code": code,
                "name": name,
                "description": description,
                "status": status,
                "default_language": default_language,
            }
        ),
        201,
    )
