from flask import Blueprint, request, jsonify
from db import fetch_all, fetch_one, execute, get_conn
import json
import hashlib
from datetime import datetime
import pymysql

bp_forms_versions = Blueprint("bp_forms_versions", __name__, url_prefix="/api/forms")


def _as_int(v, default=None):
    try:
        return int(v)
    except Exception:
        return default


def _json_dumps_if_needed(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _schema_has_elements(schema_obj) -> bool:
    """
    Regra: precisa existir pelo menos 1 elemento no schema.
    Formato esperado no teu builder:
      { sections: [ { elements: [...] }, ... ] }
    """
    if not isinstance(schema_obj, dict):
        return False
    sections = schema_obj.get("sections") or []
    if not isinstance(sections, list):
        return False
    for s in sections:
        if not isinstance(s, dict):
            continue
        els = s.get("elements") or []
        if isinstance(els, list) and len(els) > 0:
            return True
    return False


@bp_forms_versions.get("/<int:id_form>/versions")
def list_versions(id_form: int):
    tenant_id = _as_int(request.args.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    rows = fetch_all(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        ORDER BY version_number DESC
        """,
        {"tenant_id": tenant_id, "id_form": id_form},
    )
    return jsonify(rows)


@bp_forms_versions.get("/<int:id_form>/versions/<int:id_form_version>")
def get_version(id_form: int, id_form_version: int):
    tenant_id = _as_int(request.args.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    row = fetch_one(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )

    if not row:
        return jsonify({"error": "Version not found"}), 404

    return jsonify(row)


@bp_forms_versions.post("/<int:id_form>/versions")
def create_version(id_form: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    status = (data.get("status") or "DRAFT").upper()
    if status not in ("DRAFT", "PUBLISHED", "ARCHIVED"):
        status = "DRAFT"

    checksum = hashlib.sha256(schema_json.encode("utf-8")).hexdigest()

    last = fetch_one(
        """
        SELECT MAX(version_number) AS max_version
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form},
    )
    next_version = (last.get("max_version") or 0) + 1 if last else 1

    new_id = execute(
        """
        INSERT INTO form_version
          (tenant_id, id_form, version_number, status, schema_json, checksum_sha256, created_at, updated_at)
        VALUES
          (%(tenant_id)s, %(id_form)s, %(version_number)s, %(status)s, %(schema_json)s, %(checksum_sha256)s, NOW(), NOW())
        """,
        {
            "tenant_id": tenant_id,
            "id_form": id_form,
            "version_number": next_version,
            "status": status,
            "schema_json": schema_json,
            "checksum_sha256": checksum,
        },
    )

    created = fetch_one(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE id_form_version = %(id_form_version)s
        """,
        {"id_form_version": new_id},
    )

    return jsonify(created), 201


@bp_forms_versions.post("/<int:id_form>/versions/draft")
def save_draft(id_form: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    checksum = hashlib.sha256(schema_json.encode("utf-8")).hexdigest()
    version_id = _as_int(data.get("version_id"))

    # 1) Se veio version_id e é DRAFT -> atualiza
    if version_id:
        existing = fetch_one(
            """
            SELECT id_form_version, status
            FROM form_version
            WHERE tenant_id = %(tenant_id)s
              AND id_form = %(id_form)s
              AND id_form_version = %(id_form_version)s
              AND deleted_at IS NULL
            """,
            {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": version_id},
        )
        if existing and (existing.get("status") or "").upper() == "DRAFT":
            execute(
                """
                UPDATE form_version
                SET schema_json = %(schema_json)s,
                    checksum_sha256 = %(checksum_sha256)s,
                    updated_at = NOW()
                WHERE tenant_id = %(tenant_id)s
                  AND id_form = %(id_form)s
                  AND id_form_version = %(id_form_version)s
                  AND status = 'DRAFT'
                """,
                {
                    "schema_json": schema_json,
                    "checksum_sha256": checksum,
                    "tenant_id": tenant_id,
                    "id_form": id_form,
                    "id_form_version": version_id,
                },
            )
            row = fetch_one(
                """
                SELECT
                  id_form_version, tenant_id, id_form, version_number, status,
                  schema_json, publish_at, published_by, checksum_sha256,
                  created_at, created_by, updated_at, updated_by
                FROM form_version
                WHERE tenant_id = %(tenant_id)s
                  AND id_form = %(id_form)s
                  AND id_form_version = %(id_form_version)s
                """,
                {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": version_id},
            )
            return jsonify(row)

    # 2) Tenta atualizar o draft mais recente
    draft = fetch_one(
        """
        SELECT id_form_version
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND status = 'DRAFT'
          AND deleted_at IS NULL
        ORDER BY version_number DESC
        LIMIT 1
        """,
        {"tenant_id": tenant_id, "id_form": id_form},
    )

    if draft:
        execute(
            """
            UPDATE form_version
            SET schema_json = %(schema_json)s,
                checksum_sha256 = %(checksum_sha256)s,
                updated_at = NOW()
            WHERE tenant_id = %(tenant_id)s
              AND id_form = %(id_form)s
              AND id_form_version = %(id_form_version)s
              AND status = 'DRAFT'
            """,
            {
                "schema_json": schema_json,
                "checksum_sha256": checksum,
                "tenant_id": tenant_id,
                "id_form": id_form,
                "id_form_version": draft["id_form_version"],
            },
        )

        row = fetch_one(
            """
            SELECT
              id_form_version, tenant_id, id_form, version_number, status,
              schema_json, publish_at, published_by, checksum_sha256,
              created_at, created_by, updated_at, updated_by
            FROM form_version
            WHERE tenant_id = %(tenant_id)s
              AND id_form = %(id_form)s
              AND id_form_version = %(id_form_version)s
            """,
            {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": draft["id_form_version"]},
        )
        return jsonify(row)

    # 3) Cria novo DRAFT
    last = fetch_one(
        """
        SELECT MAX(version_number) AS max_version
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form},
    )
    next_version = (last.get("max_version") or 0) + 1 if last else 1

    new_id = execute(
        """
        INSERT INTO form_version
          (tenant_id, id_form, version_number, status, schema_json, checksum_sha256, created_at, updated_at)
        VALUES
          (%(tenant_id)s, %(id_form)s, %(version_number)s, 'DRAFT', %(schema_json)s, %(checksum_sha256)s, NOW(), NOW())
        """,
        {
            "tenant_id": tenant_id,
            "id_form": id_form,
            "version_number": next_version,
            "schema_json": schema_json,
            "checksum_sha256": checksum,
        },
    )

    created = fetch_one(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE id_form_version = %(id_form_version)s
        """,
        {"id_form_version": new_id},
    )

    return jsonify(created), 201


@bp_forms_versions.put("/<int:id_form>/versions/<int:id_form_version>")
def update_version(id_form: int, id_form_version: int):
    data = request.get_json(silent=True) or {}
    tenant_id = _as_int(data.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    existing = fetch_one(
        """
        SELECT id_form_version, status
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
          AND deleted_at IS NULL
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )
    if not existing:
        return jsonify({"error": "Version not found"}), 404

    if (existing.get("status") or "").upper() != "DRAFT":
        return jsonify({"error": "Only DRAFT versions can be updated"}), 409

    schema_json = _json_dumps_if_needed(data.get("schema_json"))
    if not schema_json:
        return jsonify({"error": "schema_json is required"}), 400

    checksum = hashlib.sha256(schema_json.encode("utf-8")).hexdigest()

    execute(
        """
        UPDATE form_version
        SET schema_json = %(schema_json)s,
            checksum_sha256 = %(checksum_sha256)s,
            updated_at = NOW()
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
        """,
        {
            "schema_json": schema_json,
            "checksum_sha256": checksum,
            "tenant_id": tenant_id,
            "id_form": id_form,
            "id_form_version": id_form_version,
        },
    )

    row = fetch_one(
        """
        SELECT
          id_form_version,
          tenant_id,
          id_form,
          version_number,
          status,
          schema_json,
          publish_at,
          published_by,
          checksum_sha256,
          created_at,
          created_by,
          updated_at,
          updated_by
        FROM form_version
        WHERE tenant_id = %(tenant_id)s
          AND id_form = %(id_form)s
          AND id_form_version = %(id_form_version)s
        """,
        {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
    )
    return jsonify(row)


@bp_forms_versions.post("/<int:id_form>/versions/<int:id_form_version>/publish")
def publish_version(id_form: int, id_form_version: int):
    """
    PUBLICAR versão do formulário.

    Regras:
    - Apenas DRAFT pode publicar
    - Ao publicar:
      - status => PUBLISHED
      - publish_at preenchido
      - published_by preenchido
    - Apenas 1 PUBLISHED por (tenant_id, id_form)
      - mode=replace -> arquiva a anterior e publica a nova (transação)
      - mode=error   -> bloqueia se já existir publicada
    - Bloqueia publicação se schema não tiver nenhum elemento (sections[].elements[])
    - Compatível com UNIQUE (id_form, published_flag) já aplicada
    """
    data = request.get_json(silent=True) or {}

    tenant_id = _as_int(data.get("tenant_id") or request.args.get("tenant_id"))
    if not tenant_id:
        return jsonify({"error": "tenant_id is required"}), 400

    mode = (request.args.get("mode") or data.get("mode") or "replace").lower()
    if mode not in ("replace", "error"):
        return jsonify({"error": "invalid_mode", "message": "mode must be 'replace' or 'error'"}), 400

    published_by = (
        (data.get("published_by") or "").strip()
        or (request.headers.get("X-User-Id") or "").strip()
        or "system"
    )

    conn = get_conn()

    try:
        conn.begin()
        with conn.cursor() as cur:
            # 1) Lock da versão alvo
            cur.execute(
                """
                SELECT id_form_version, status, schema_json
                FROM form_version
                WHERE tenant_id = %(tenant_id)s
                  AND id_form = %(id_form)s
                  AND id_form_version = %(id_form_version)s
                  AND deleted_at IS NULL
                FOR UPDATE
                """,
                {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
            )
            target = cur.fetchone()
            if not target:
                conn.rollback()
                return jsonify({"error": "Version not found"}), 404

            if (target.get("status") or "").upper() != "DRAFT":
                conn.rollback()
                return jsonify({"error": "Only DRAFT versions can be published"}), 409

            # 2) valida schema não vazio
            schema_raw = target.get("schema_json")
            if not schema_raw:
                conn.rollback()
                return jsonify({"error": "Cannot publish an empty schema"}), 409

            try:
                schema_obj = json.loads(schema_raw) if isinstance(schema_raw, str) else schema_raw
            except Exception:
                conn.rollback()
                return jsonify({"error": "schema_json is not valid JSON"}), 400

            if not _schema_has_elements(schema_obj):
                conn.rollback()
                return jsonify({"error": "Cannot publish without at least one element"}), 409

            # 3) lock da publicada atual (se existir)
            cur.execute(
                """
                SELECT id_form_version
                FROM form_version
                WHERE tenant_id = %(tenant_id)s
                  AND id_form = %(id_form)s
                  AND status = 'PUBLISHED'
                  AND deleted_at IS NULL
                LIMIT 1
                FOR UPDATE
                """,
                {"tenant_id": tenant_id, "id_form": id_form},
            )
            published_current = cur.fetchone()

            if published_current and int(published_current["id_form_version"]) != int(id_form_version):
                if mode == "error":
                    conn.rollback()
                    return jsonify({"error": "There is already a published version for this form"}), 409

                # mode=replace: arquiva a anterior
                cur.execute(
                    """
                    UPDATE form_version
                    SET status = 'ARCHIVED',
                        updated_at = NOW()
                    WHERE tenant_id = %(tenant_id)s
                      AND id_form = %(id_form)s
                      AND id_form_version = %(id_form_version)s
                      AND status = 'PUBLISHED'
                      AND deleted_at IS NULL
                    """,
                    {
                        "tenant_id": tenant_id,
                        "id_form": id_form,
                        "id_form_version": published_current["id_form_version"],
                    },
                )

            # 4) publica a versão alvo
            cur.execute(
                """
                UPDATE form_version
                SET status = 'PUBLISHED',
                    publish_at = NOW(),
                    published_by = %(published_by)s,
                    updated_at = NOW()
                WHERE tenant_id = %(tenant_id)s
                  AND id_form = %(id_form)s
                  AND id_form_version = %(id_form_version)s
                  AND status = 'DRAFT'
                  AND deleted_at IS NULL
                """,
                {
                    "tenant_id": tenant_id,
                    "id_form": id_form,
                    "id_form_version": id_form_version,
                    "published_by": published_by,
                },
            )

        conn.commit()

        row = fetch_one(
            """
            SELECT
              id_form_version,
              tenant_id,
              id_form,
              version_number,
              status,
              schema_json,
              publish_at,
              published_by,
              checksum_sha256,
              created_at,
              created_by,
              updated_at,
              updated_by
            FROM form_version
            WHERE tenant_id = %(tenant_id)s
              AND id_form = %(id_form)s
              AND id_form_version = %(id_form_version)s
              AND deleted_at IS NULL
            """,
            {"tenant_id": tenant_id, "id_form": id_form, "id_form_version": id_form_version},
        )

        return jsonify(row)

    except pymysql.err.IntegrityError as e:
        # UNIQUE (id_form, published_flag) pode disparar em concorrência
        try:
            conn.rollback()
        except Exception:
            pass
        msg = str(e)
        if "uq_form_one_published" in msg or "Duplicate entry" in msg:
            return jsonify({"error": "There is already a published version for this form"}), 409
        return jsonify({"error": msg}), 500

    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500
