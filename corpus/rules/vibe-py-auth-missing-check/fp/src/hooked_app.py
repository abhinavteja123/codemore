from flask import Flask, abort, request, session

from .db import db, Audit

app = Flask(__name__)


@app.before_request
def require_auth():
    if "user_id" not in session:
        abort(401)


@app.route("/audits", methods=["POST"])
def create_audit():
    entry = Audit(payload=request.get_json())
    db.session.add(entry)
    db.session.commit()
    return "", 201
