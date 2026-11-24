"""Resolve the GitHub handle of a user authenticated by Cloudflare Access."""

import hashlib
import json
import os
import re
import time
from collections import OrderedDict
from threading import Lock

import httpx
from fastapi import HTTPException


# Cache only successful lookups. Every request still verifies its Access JWT.
_cache = OrderedDict()
_cache_lock = Lock()
_handle = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}")


def _read_profile(url, headers, service):
    try:
        response = httpx.get(url, headers=headers, timeout=5, follow_redirects=False)
        response.raise_for_status()
        profile = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(503, f"無法讀取 {service} 帳號資料，請稍後再試或聯絡管理員") from exc
    if not isinstance(profile, dict):
        raise HTTPException(503, f"{service} 回傳的帳號資料格式不正確")
    return profile


def _account_id(value):
    if type(value) is int and 0 < value < 2**63:
        return value
    if isinstance(value, str) and re.fullmatch(r"[1-9][0-9]{0,17}", value):
        return int(value)
    return None


def _configured_id(subject):
    try:
        mapping = json.loads(os.getenv("FLOW_GITHUB_ID_MAP") or "{}")
        if not isinstance(mapping, dict):
            raise ValueError
        if subject in mapping:
            account_id = _account_id(mapping[subject])
            if account_id is None:
                raise ValueError
            return account_id
    except ValueError as exc:
        raise HTTPException(503, "請管理員檢查 FLOW_GITHUB_ID_MAP 的格式") from exc
    return None


def _resolve(assertion, claims):
    identity = _read_profile(
        claims["iss"] + "/cdn-cgi/access/get-identity",
        {"Cookie": "CF_Authorization=" + assertion},
        "Cloudflare Access",
    )
    provider = identity.get("idp")
    if not isinstance(provider, dict) or provider.get("type") != "github":
        raise HTTPException(403, "請透過此網站的 GitHub 登入方式連線")
    if identity.get("user_uuid") != claims["sub"]:
        raise HTTPException(403, "Access 登入者與身分資料不一致，請重新登入")

    # Native GitHub identities can expose the upstream user ID at the top level.
    # idp.id identifies the Access provider configuration, not the GitHub account.
    account_id = _account_id(identity.get("id"))
    if account_id is None:
        login = identity.get("login")
        if isinstance(login, str) and _handle.fullmatch(login):
            return login
        account_id = _configured_id(claims["sub"])
    if account_id is None:
        raise HTTPException(503, "Access 未提供 GitHub 帳號 ID，請管理員設定 FLOW_GITHUB_ID_MAP")

    headers = {"Accept": "application/vnd.github+json"}
    token = os.getenv("FLOW_GITHUB_API_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    profile = _read_profile(f"https://api.github.com/user/{account_id}", headers, "GitHub")
    login = profile.get("login")
    if _account_id(profile.get("id")) != account_id or not isinstance(login, str) or not _handle.fullmatch(login):
        raise HTTPException(503, "GitHub 回傳的帳號與登入資料不一致")
    return login


def github_login(assertion, claims):
    key = hashlib.sha256(assertion.encode()).digest()
    with _cache_lock:
        entry = _cache.get(key)
        if entry and entry[0] > time.time():
            _cache.move_to_end(key)
            return entry[1]
    login = _resolve(assertion, claims)
    with _cache_lock:
        _cache[key] = (min(claims["exp"], time.time() + 900), login)
        _cache.move_to_end(key)
        if len(_cache) > 256:
            _cache.popitem(last=False)
    return login
