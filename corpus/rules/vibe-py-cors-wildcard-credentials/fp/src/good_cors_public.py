from flask import Flask
from flask_cors import CORS

app = Flask(__name__)

# Public read-only API: wildcard origin is fine WITHOUT credentials.
CORS(app, origins="*")
