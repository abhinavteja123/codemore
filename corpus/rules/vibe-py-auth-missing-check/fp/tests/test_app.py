from flask import Flask, request

app = Flask(__name__)


@app.route("/fixture", methods=["POST"])
def fixture_route():
    return request.get_json()
