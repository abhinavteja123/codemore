from flask import Flask, jsonify, request

from .db import db, Post

app = Flask(__name__)


@app.route("/posts", methods=["POST"])
def create_post():
    data = request.get_json()
    post = Post(title=data["title"], body=data["body"])
    db.session.add(post)
    db.session.commit()
    return jsonify({"id": post.id})


@app.post("/comments")
def create_comment():
    text = request.form["text"]
    db.session.execute("INSERT INTO comments (text) VALUES (:t)", {"t": text})
    db.session.commit()
    return "ok"
