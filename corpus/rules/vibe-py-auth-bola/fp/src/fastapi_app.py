from fastapi import Depends, FastAPI, HTTPException

from .auth import get_current_user
from .db import SessionLocal
from .models import Item, User

app = FastAPI()


@app.get("/items/{item_id}")
def read_item(item_id: int, user: User = Depends(get_current_user)):
    db = SessionLocal()
    item = db.query(Item).filter(Item.id == item_id, Item.owner_id == user.id).first()
    if item is None:
        raise HTTPException(status_code=404)
    return item
