# False-positive fixture: NOTHING here may fire
# core-security-hardcoded-password.
import os

# Real credential read from the environment — the recommended pattern.
password = os.environ.get("DB_PASSWORD")

# Placeholders and docs values.
db_password = "changeme"
example_password = "your-password-here"
test_password = "xxxxxxxx"
admin_password = "<insert-password>"
template_password = "${DB_PASSWORD}"

# Too short to be a real credential / test stubs.
pw_stub_password = "ab"

# Comment mention only: password = "hunter2secret"

# Identifier does not END with a credential keyword.
password_hash = "5f4dcc3b5aa765d61d8327deb882cf99"
password_field = "password"
password_label = "Enter your password"
