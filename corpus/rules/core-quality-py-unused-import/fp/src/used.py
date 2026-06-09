import os
from typing import List
import json as j

def list_files(root: str) -> List[str]:
    return [p for p in os.listdir(root)]

def to_json(data) -> str:
    return j.dumps(data)
