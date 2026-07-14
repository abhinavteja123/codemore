from flask import Flask, jsonify, request
from flask_login import current_user, login_required

from .db import db, Post

app = Flask(__name__)


@app.route("/posts", methods=["POST"])
@login_required
def create_post():
    data = request.get_json()
    post = Post(title=data["title"], user_id=current_user.id)
    db.session.add(post)
    db.session.commit()
    return jsonify({"id": post.id})


@app.route("/posts/<int:post_id>", methods=["DELETE"])
def delete_post(post_id):
    Post.query.filter_by(id=post_id).delete()
    db.session.commit()
    return "", 204
