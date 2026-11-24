"""Count and read one ordered page inside the caller's SQLite read transaction."""

from typing import Annotated

from fastapi import Query

PageNumber = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def read_page(db, columns, source, params, order, page, size):
    total = db.execute("SELECT COUNT(*) " + source, params).fetchone()[0]
    pages = max(1, (total + size - 1) // size)
    page = min(page, pages)
    rows = db.execute(f"SELECT {columns} {source} ORDER BY {order} LIMIT ? OFFSET ?",
                      (*params, size, (page - 1) * size))
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "pages": pages, "size": size}
