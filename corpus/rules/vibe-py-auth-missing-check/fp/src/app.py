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


@app.route("/posts", methods=["GET"])
def list_posts():
    return jsonify([p.to_dict() for p in Post.query.all()])
