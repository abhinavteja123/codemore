import os

from flask import Flask, make_response, request

app = Flask(__name__)

IS_PROD = os.environ.get("ENV") == "production"


@app.route("/login", methods=["POST"])
def login():
    resp = make_response("ok")
    resp.set_cookie(
        "session_id",
        request.form["token"],
        secure=True,
        httponly=True,
        samesite="Lax",
    )
    return resp


@app.route("/csrf", methods=["POST"])
def csrf():
    resp = make_response("ok")
    resp.set_cookie("csrftoken", "t", secure=IS_PROD, httponly=True, samesite="Strict")
    return resp


def set_pref(resp, cookie_opts):
    resp.set_cookie("theme", "dark", **cookie_opts)
    return resp


def logout(resp):
    resp.delete_cookie("session_id")
    return resp
