import hashlib
import secrets
import os
import re
from functools import lru_cache
from urllib.parse import urlsplit

import jwt
from fastapi import HTTPException
from starlette.requests import HTTPConnection

from .github_identity import github_login


@lru_cache
def signing_keys(issuer):
    return jwt.PyJWKClient(issuer + "/cdn-cgi/access/certs", timeout=5)


def authenticate(conn: HTTPConnection):
    mode = os.getenv("FLOW_AUTH", "cloudflare")
    if mode == "local":
        local = {"localhost", "127.0.0.1", "::1"}
        if (
            not conn.client
            or conn.client.host not in local
            or conn.url.hostname not in local
            or any(h in conn.headers for h in ("cf-ray", "forwarded", "x-forwarded-for", "cf-connecting-ip"))
        ):
            raise HTTPException(403, "本機模式僅開放 loopback")
        origin = "http://" + conn.headers["host"]
        token = conn.cookies.get("flow_local_identity", "")
        if not re.fullmatch(r"[a-f0-9]{64}", token):
            token = secrets.token_hex(32)
            conn.state.new_local_token = token
        subject = token
        user = {"label": "本機開發", "storage_key": "本機開發", "expires": None, "mode": mode}
    else:
        issuer = os.getenv("CF_ACCESS_ISSUER", "").rstrip("/")
        aud = os.getenv("CF_ACCESS_AUD", "")
        origin = os.getenv("FLOW_ORIGIN", "").rstrip("/")
        if (
            mode != "cloudflare"
            or not aud
            or not re.fullmatch(r"https://[a-z0-9-]+\.cloudflareaccess\.com", issuer)
            or not origin.startswith("https://")
            or not urlsplit(origin).hostname
        ):
            raise HTTPException(503, "請設定 Cloudflare Access 登入參數")
        assertion = conn.headers.get("cf-access-jwt-assertion")
        if not assertion:
            raise HTTPException(401, "需要 Cloudflare Access 登入")
        try:
            key = signing_keys(issuer).get_signing_key_from_jwt(assertion)
            claims = jwt.decode(
                assertion,
                key.key,
                algorithms=["RS256"],
                audience=aud,
                issuer=issuer,
                options={"require": ["aud", "iss", "exp", "sub", "email", "iat"]},
            )
            if (
                claims.get("type") != "app"
                or not isinstance(claims["email"], str)
                or not claims["email"]
                or not claims["sub"]
                or type(claims["exp"]) is not int
            ):
                raise jwt.InvalidTokenError()
        except jwt.PyJWTError as exc:
            raise HTTPException(401, "Access 登入已逾期或無效") from exc
        subject = issuer + "/" + claims["sub"]
    supplied = conn.headers.get("origin")
    if (supplied is not None or conn.scope["type"] == "websocket") and supplied != origin:
        raise HTTPException(403, "請從此網站操作")
    if mode == "cloudflare":
        username = github_login(assertion, claims)
        user = {
            "label": username,
            "username": username,
            "storage_key": claims["email"],
            "expires": claims["exp"],
            "mode": mode,
        }
    conn.state.principal = hashlib.sha256(subject.encode()).hexdigest()
    return user
