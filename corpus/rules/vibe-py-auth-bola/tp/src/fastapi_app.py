from fastapi import Depends, FastAPI

from .auth import get_current_user
from .db import SessionLocal
from .models import Item, User

app = FastAPI()


@app.delete("/items/{item_id}")
def delete_item(item_id: int, user: User = Depends(get_current_user)):
    db = SessionLocal()
    item = db.query(Item).filter(Item.id == item_id).first()
    db.delete(item)
    db.commit()
    return {"deleted": item_id}
