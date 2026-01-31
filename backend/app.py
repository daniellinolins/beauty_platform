from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from db import close_conn

from routes.forms import bp_forms
from routes.submissions import bp_submissions

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # CORS liberado para desenvolvimento
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    app.teardown_appcontext(close_conn)

    app.register_blueprint(bp_forms)
    app.register_blueprint(bp_submissions)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
