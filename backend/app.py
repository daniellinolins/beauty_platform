import os
from flask import Flask
from flask_cors import CORS

from config import Config
from db import close_conn

from routes.forms import bp_forms
from routes.forms_versions import bp_forms_versions
from routes.submissions import bp_submissions
from routes.files import bp_files


from routes.forms_versions import bp_secure_forms_versions

from routes.secure_clients import bp_secure_clients




def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    app.config.from_object(Config)

    app.config.setdefault("DB_HOST", os.getenv("DB_HOST", "localhost"))
    app.config.setdefault("DB_PORT", int(os.getenv("DB_PORT", "3306")))
    app.config.setdefault("DB_USER", os.getenv("DB_USER", "root"))
    app.config.setdefault("DB_PASSWORD", os.getenv("DB_PASSWORD", ""))
    app.config.setdefault("DB_NAME", os.getenv("DB_NAME", "beauty_platform"))

    app.teardown_appcontext(close_conn)

    # Existing modules (legacy)
    app.register_blueprint(bp_forms)
    app.register_blueprint(bp_forms_versions)
    app.register_blueprint(bp_submissions)
    app.register_blueprint(bp_files)

    # Phase 1 Identity modules (safe import)
    try:
        from routes.auth import bp_auth
        app.register_blueprint(bp_auth)
    except Exception:
        pass

    try:
        from routes.associations import bp_assoc
        app.register_blueprint(bp_assoc)
    except Exception:
        pass

    try:
        from routes.notifications import bp_notif
        app.register_blueprint(bp_notif)
    except Exception:
        pass

    try:
        from routes.services import bp_services
        app.register_blueprint(bp_services)
    except Exception:
        pass

    try:
        from routes.clinic_users import bp_clinic_users
        app.register_blueprint(bp_clinic_users)
    except Exception:
        pass

    try:
        from routes.tenant_usage import bp_tenant_usage
        app.register_blueprint(bp_tenant_usage)
    except Exception:
        pass

    try:
        from routes.me import bp_me
        app.register_blueprint(bp_me)
    except Exception:
        pass

    # Secure APIs
    try:
        from routes.secure_files import bp_secure_files
        app.register_blueprint(bp_secure_files)
    except Exception:
        pass

    try:
        from routes.secure_submissions import bp_secure_submissions
        app.register_blueprint(bp_secure_submissions)
    except Exception:
        pass

    try:
        from routes.secure_forms import bp_secure_forms
        app.register_blueprint(bp_secure_forms)
    except Exception:
        pass

    try:
        from routes.secure_form_versions import bp_secure_form_versions
        app.register_blueprint(bp_secure_form_versions)
    except Exception:
        pass

    try:
        from routes.setup import bp_setup
        app.register_blueprint(bp_setup)
    except Exception:
        pass

    
    app.register_blueprint(bp_secure_forms_versions)

    app.register_blueprint(bp_secure_clients)



    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
