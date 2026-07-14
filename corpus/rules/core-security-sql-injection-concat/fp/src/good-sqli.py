def get_user(cursor, user_id):
    cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    return cursor.fetchone()


def get_by_name(cursor, name):
    cursor.execute("SELECT * FROM users WHERE name = ?", (name,))
    return cursor.fetchone()


def list_users(cursor):
    cursor.execute("SELECT id, name FROM users ORDER BY name")
    return cursor.fetchall()
