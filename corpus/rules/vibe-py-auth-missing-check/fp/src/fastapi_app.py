from fastapi import Depends, FastAPI

from .auth import get_current_user
from .models import Item, User

app = FastAPI()


@app.post("/items")
def create_item(item: Item, user: User = Depends(get_current_user)):
    return {"name": item.name, "owner": user.id}
