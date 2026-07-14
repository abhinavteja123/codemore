from flask import Flask, jsonify, request

from .db import db, Post

app = Flask(__name__)


@app.route("/posts", methods=["POST"])
def create_post():
    data = request.get_json()
    post = Post(title=data["title"])
    db.session.add(post)
    db.session.commit()
    return jsonify({"id": post.id})


@app.route("/posts/<int:post_id>", methods=["DELETE"])
def delete_post(post_id):
    Post.query.filter_by(id=post_id).delete()
    db.session.commit()
    return "", 204
