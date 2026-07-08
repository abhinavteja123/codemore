# True-positive fixture: every credential below MUST fire
# core-security-hardcoded-password.
import sqlite3

# The exact class bandit B105 caught in the 2026-07-07 recall audit:
password = "hunter2secret"

db_password = 'pr0d-mysql-9f2!'

app_config = {}
app_config['SECRET_KEY'] = 'dev-9f8e7d6c5b4a'


def connect():
    return sqlite3.connect('db.sqlite', password="s3cretDBpass")


def check_admin(supplied: str) -> bool:
    # Auth backdoor: comparison form.
    admin_password = "letmein42"
    return supplied == admin_password
