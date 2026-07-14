from flask import Flask, jsonify, request
from pydantic import BaseModel, ValidationError

from .db import db, Post

app = Flask(__name__)


class CreatePost(BaseModel):
    title: str
    body: str


@app.route("/posts", methods=["POST"])
def create_post():
    try:
        payload = CreatePost.model_validate(request.get_json())
    except ValidationError:
        return {"error": "invalid input"}, 400
    post = Post(title=payload.title, body=payload.body)
    db.session.add(post)
    db.session.commit()
    return jsonify({"id": post.id})


@app.route("/posts", methods=["GET"])
def list_posts():
    limit = request.args.get("limit", 20)
    return jsonify([p.to_dict() for p in Post.query.limit(limit)])
