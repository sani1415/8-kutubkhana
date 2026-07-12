import json
import re
from pathlib import Path

src = Path(r"C:\Users\sanim\.cursor\projects\d-programming-8-kutubkhana\agent-tools\a3e5924c-114f-4524-94a6-f1ddbb094a9b.txt")
raw = src.read_text(encoding="utf-8")
data = json.loads(raw)
result = data.get("result", data)
if isinstance(result, str):
    # embedded JSON array in result string
    m = re.search(r"\[.*\]", result, re.DOTALL)
    books = json.loads(m.group(0)) if m else []
elif isinstance(result, list):
    books = result
else:
    books = []

out = Path(__file__).resolve().parent / "_db_books.json"
out.write_text(json.dumps(books, ensure_ascii=False), encoding="utf-8")
print("type", type(result).__name__, "books", len(books))
if books:
    print("sample keys", list(books[0].keys()))
