import os
from flask import current_app, g
import pymysql


def _cfg(key: str, default=None):
    # Prefer Flask config, but fallback to env vars so the API can run without a separate config.py
    return current_app.config.get(key, os.getenv(key, default))


def get_conn():
    conn = getattr(g, '_db_conn', None)
    if conn is None:
        conn = pymysql.connect(
            host=_cfg('DB_HOST', 'localhost'),
            user=_cfg('DB_USER', 'root'),
            password=_cfg('DB_PASSWORD', ''),
            database=_cfg('DB_NAME', _cfg('DB_DATABASE', 'beauty_platform')),
            port=int(_cfg('DB_PORT', 3306)),
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
        )
        g._db_conn = conn
    return conn


def close_conn(_exc=None):
    conn = getattr(g, '_db_conn', None)
    if conn is not None:
        try:
            conn.close()
        finally:
            g._db_conn = None


def fetch_all(sql: str, params=None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()


def fetch_one(sql: str, params=None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchone()


def execute(sql: str, params=None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.lastrowid


def execute_no_return(sql: str, params=None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params or ())


# Backwards-compatible aliases (some files were importing these names)
query_all = fetch_all
query_one = fetch_one
