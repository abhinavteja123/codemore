from flask import Flask, jsonify
from flask_login import login_required

from .db import db, Post

app = Flask(__name__)


@app.route("/posts/<int:post_id>", methods=["GET"])
@login_required
def get_post(post_id):
    post = Post.query.get_or_404(post_id)
    return jsonify(post.to_dict())


@app.route("/posts/<int:post_id>", methods=["DELETE"])
@login_required
def delete_post(post_id):
    Post.query.filter_by(id=post_id).delete()
    db.session.commit()
    return "", 204
