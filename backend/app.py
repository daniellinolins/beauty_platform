import os
from flask import Flask
from flask_cors import CORS

from routes.forms import bp_forms
from routes.forms_versions import bp_forms_versions
from routes.submissions import bp_submissions


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    # Make DB_* available in current_app.config for db.py (it also falls back to env vars).
    app.config.setdefault('DB_HOST', os.getenv('DB_HOST', 'localhost'))
    app.config.setdefault('DB_PORT', int(os.getenv('DB_PORT', '3306')))
    app.config.setdefault('DB_USER', os.getenv('DB_USER', 'root'))
    app.config.setdefault('DB_PASSWORD', os.getenv('DB_PASSWORD', ''))
    app.config.setdefault('DB_NAME', os.getenv('DB_NAME', 'beauty_platform'))

    # API routes
    app.register_blueprint(bp_forms)
    app.register_blueprint(bp_forms_versions)
    app.register_blueprint(bp_submissions)

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '5000')), debug=True)
