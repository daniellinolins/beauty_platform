from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from db import close_conn

from routes.forms import bp_forms
from routes.submissions import bp_submissions

from routes.files import bp_files


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # CORS liberado para desenvolvimento
    #CORS(app, resources={r"/api/*": {"origins": "*"}})
    CORS(app, resources={r"/api/*": {"origins": [
        "http://localhost",
        "http://localhost:8100",
        "ionic://localhost",
        "capacitor://localhost",
        "http://144.64.115.131",
        "https://144.64.115.131",
        "http://144.64.115.131:5000",
        "https://144.64.115.131:5000"
        "http://192.168.1.178",
        "https://192.168.1.178",
        "http://192.168.1.178:5000",
        "https://192.168.1.178:5000"                
    ]}}, supports_credentials=True)

    app.teardown_appcontext(close_conn)

    app.register_blueprint(bp_forms)
    app.register_blueprint(bp_submissions)
    app.register_blueprint(bp_files)


    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
