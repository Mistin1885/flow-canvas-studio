"""Private authorization boundary for management operations."""

from urllib.parse import unquote

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from . import snapshots, storage

router = APIRouter()


def identity(x_flow_principal: str = Header(), x_flow_realm: str = Header()):
    return (x_flow_realm, x_flow_principal)


def owns(db, user):
    row = db.execute("SELECT principal FROM admin_owner WHERE realm=?", (user[0],)).fetchone()
    return row is not None and row[0] == user[1]


@router.get("/identity/session")
def session(user=Depends(identity)):
    with storage.session() as db:
        row = db.execute("SELECT realm FROM admin_owner").fetchone()
        return {"admin": owns(db, user), "first_login": row is None or (row[0] == "local" and user[0] == "cloudflare")}


@router.post("/identity/login")
def login(user=Depends(identity)):
    with storage.session(True) as db:
        # A first verified Access login replaces the local development owner once.
        db.execute("""INSERT INTO admin_owner(singleton,realm,principal) VALUES(1,?,?)
            ON CONFLICT(singleton) DO UPDATE SET realm=excluded.realm, principal=excluded.principal
            WHERE admin_owner.realm='local' AND excluded.realm='cloudflare'""", user)
        return {"admin": owns(db, user)}


def require_admin(user=Depends(identity)):
    with storage.session() as db:
        if not owns(db, user):
            raise HTTPException(403, "此功能僅開放系統管理員")


@router.get("/api/admin/backups", dependencies=[Depends(require_admin)])
def backups():
    with storage.session() as db:
        return snapshots.listing(db)


@router.get("/api/admin/backup-status", dependencies=[Depends(require_admin)])
def backup_status():
    with storage.session() as db:
        return dict(db.execute("SELECT attempted,succeeded,failed,state,captured,error FROM scan_status").fetchone())


class Expected(BaseModel):
    updated: str
    revision: int | None


@router.post("/api/admin/backups/{point}/restore", dependencies=[Depends(require_admin)])
def restore(point: int, body: Expected, x_flow_editor: str = Header()):
    with storage.session(True) as db:
        return snapshots.restore(db, point, unquote(x_flow_editor), (body.updated, body.revision))
