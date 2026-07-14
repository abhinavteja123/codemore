from flask import Flask, make_response, request

app = Flask(__name__)


@app.route("/login", methods=["POST"])
def login():
    resp = make_response("ok")
    resp.set_cookie("session_id", request.form["token"])
    return resp


@app.route("/remember", methods=["POST"])
def remember():
    resp = make_response("ok")
    resp.set_cookie("remember_me", "1", secure=False, samesite="Lax")
    return resp
