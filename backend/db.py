import pymysql
from flask import g, current_app
import json

def _normalize_params(params: dict | None):
    if not params:
        return {}
    out = {}
    for k, v in params.items():
        if isinstance(v, (dict, list)):
            out[k] = json.dumps(v, ensure_ascii=False)
        else:
            out[k] = v
    return out




def get_conn():
    if "db_conn" not in g:
        g.db_conn = pymysql.connect(
            host=current_app.config["DB_HOST"],
            port=current_app.config["DB_PORT"],
            user=current_app.config["DB_USER"],
            password=current_app.config["DB_PASSWORD"],
            database=current_app.config["DB_NAME"],
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
    return g.db_conn

def close_conn(e=None):
    conn = g.pop("db_conn", None)
    if conn:
        conn.close()

def fetch_one(sql: str, params: dict | None = None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or {})
        return cur.fetchone()

def fetch_all(sql: str, params: dict | None = None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or {})
        return cur.fetchall()

def execute(sql: str, params: dict | None = None) -> int:
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or {})
        conn.commit()
        return cur.lastrowid

def execute_no_return(sql: str, params: dict | None = None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, _normalize_params(params))
        conn.commit()