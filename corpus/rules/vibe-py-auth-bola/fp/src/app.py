from flask import Flask, jsonify
from flask_login import current_user, login_required

from .db import db, Post, Page

app = Flask(__name__)


@app.route("/posts/<int:post_id>", methods=["DELETE"])
@login_required
def delete_post(post_id):
    post = Post.query.filter_by(id=post_id, user_id=current_user.id).first_or_404()
    db.session.delete(post)
    db.session.commit()
    return "", 204


@app.route("/pages/<slug>", methods=["GET"])
def get_public_page(slug):
    return jsonify(Page.query.filter_by(slug=slug).first_or_404().to_dict())
