import os
from flask import Flask
from flask_cors import CORS

from config import Config
from db import close_conn

from routes.forms import bp_forms
from routes.forms_versions import bp_forms_versions
from routes.submissions import bp_submissions
from routes.files import bp_files


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

    app.register_blueprint(bp_forms)
    app.register_blueprint(bp_forms_versions)
    app.register_blueprint(bp_submissions)
    app.register_blueprint(bp_files)

    try:
        from routes.auth import bp_auth
        app.register_blueprint(bp_auth)
    except:
        pass

    try:
        from routes.associations import bp_assoc
        app.register_blueprint(bp_assoc)
    except:
        pass

    try:
        from routes.notifications import bp_notif
        app.register_blueprint(bp_notif)
    except:
        pass

    try:
        from routes.services import bp_services
        app.register_blueprint(bp_services)
    except:
        pass

    try:
        from routes.clinic_users import bp_clinic_users
        app.register_blueprint(bp_clinic_users)
    except:
        pass

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
