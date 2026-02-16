import os
from contextlib import contextmanager
from flask import current_app, g
import pymysql


def _cfg(key: str, default=None):
    # Prefer Flask config, but fallback to env vars so the API can run without a separate config.py
    return current_app.config.get(key, os.getenv(key, default))


def _normalize_params(params):
    """
    Accepts params as:
      - None
      - tuple/list
      - dict
      - any other DBAPI-compatible object
    and returns something safe for cursor.execute().
    """
    if params is None:
        return ()
    if isinstance(params, (tuple, list)):
        return tuple(params)
    if isinstance(params, dict):
        return params
    return params


def get_conn():
    conn = getattr(g, "_db_conn", None)
    if conn is None:
        conn = pymysql.connect(
            host=_cfg("DB_HOST", "localhost"),
            user=_cfg("DB_USER", "root"),
            password=_cfg("DB_PASSWORD", ""),
            database=_cfg("DB_NAME", _cfg("DB_DATABASE", "beauty_platform")),
            port=int(_cfg("DB_PORT", 3306)),
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,  # keep current behavior
        )
        g._db_conn = conn
    return conn


def close_conn(_exc=None):
    conn = getattr(g, "_db_conn", None)
    if conn is not None:
        try:
            conn.close()
        finally:
            g._db_conn = None


def fetch_all(sql: str, params=None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, _normalize_params(params))
        return cur.fetchall()


def fetch_one(sql: str, params=None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, _normalize_params(params))
        return cur.fetchone()


def execute(sql: str, params=None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, _normalize_params(params))
        return cur.lastrowid


def execute_no_return(sql: str, params: dict | None = None, return_lastrowid: bool = False):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, _normalize_params(params))
        conn.commit()
        return cur.lastrowid if return_lastrowid else None


@contextmanager
def transaction():
    """
    Transaction context manager that works with the existing g-scoped connection.

    Usage:
      with transaction() as (conn, cur):
          cur.execute(...)
          ...
    """
    conn = get_conn()

    # Save autocommit mode and force transactional mode
    prev_autocommit = conn.get_autocommit()
    try:
        if prev_autocommit:
            conn.autocommit(False)

        with conn.cursor() as cur:
            yield conn, cur

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        # Restore original autocommit mode
        try:
            conn.autocommit(prev_autocommit)
        except Exception:
            pass


def execute_in_tx(cur, sql: str, params=None):
    """
    Execute a statement using an existing transaction cursor.
    Returns lastrowid.
    """
    cur.execute(sql, _normalize_params(params))
    return cur.lastrowid


# Backwards-compatible aliases (some files were importing these names)
query_all = fetch_all
query_one = fetch_one
