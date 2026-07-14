from flask import Flask, request

app = Flask(__name__)


@app.route("/echo", methods=["POST"])
def echo():
    return request.get_json()
