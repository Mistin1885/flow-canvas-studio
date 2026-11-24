import os
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from backend.github_identity import _resolve, github_login


class GitHubProfile(unittest.TestCase):
    claims = {"iss": "https://test.cloudflareaccess.com", "sub": "user-key"}
    identity = {"user_uuid": "user-key", "idp": {"type": "github", "id": "provider-key"}}

    def resolve(self, identity, github=None):
        with patch("backend.github_identity._read_profile", side_effect=[identity, github]):
            return _resolve("test-token", self.claims)

    def test_matching_provider_and_subject_required_even_with_login(self):
        for change in ({"idp": {"type": "onetimepin"}}, {"user_uuid": "someone-else"}):
            with self.subTest(change=change), self.assertRaises(HTTPException) as err:
                self.resolve({**self.identity, "login": "someone", **change})
            self.assertEqual(err.exception.status_code, 403)

    def test_explicit_handle_and_private_subject_mapping(self):
        self.assertEqual(self.resolve({**self.identity, "login": "team_member"}), "team_member")
        with patch.dict(os.environ, FLOW_GITHUB_ID_MAP='{"user-key":42}'):
            self.assertEqual(self.resolve(self.identity, {"id": 42, "login": "renamed"}), "renamed")
            with self.assertRaises(HTTPException):
                self.resolve(self.identity, {"id": 12, "login": "different-user"})

    def test_ambiguous_identity_never_uses_name_email_or_provider_id(self):
        with patch.dict(os.environ, FLOW_GITHUB_ID_MAP=""), self.assertRaises(HTTPException) as err:
            self.resolve({**self.identity, "name": "some-name", "email": "other@example.org"})
        self.assertEqual(err.exception.status_code, 503)

    def test_upstream_failure_is_retryable(self):
        with patch("backend.github_identity.httpx.get", side_effect=httpx.ReadTimeout("timeout")):
            with self.assertRaises(HTTPException) as err:
                _resolve("test-token", self.claims)
            self.assertEqual(err.exception.status_code, 503)

    def test_username_refresh_and_token_isolation(self):
        with (
            patch("backend.github_identity._resolve", side_effect=["old-name", "teammate", "new-name"]) as lookup,
            patch("backend.github_identity.time.time", return_value=100) as clock,
        ):
            claims = {**self.claims, "exp": 5000}
            self.assertEqual(github_login("synthetic-first", claims), "old-name")
            self.assertEqual(github_login("synthetic-second", {**claims, "sub": "second"}), "teammate")
            self.assertEqual(github_login("synthetic-first", claims), "old-name")
            clock.return_value = 1001
            self.assertEqual(github_login("synthetic-first", claims), "new-name")
            self.assertEqual(lookup.call_count, 3)
