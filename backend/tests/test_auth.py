"""Firebase token verification: every way a token can be wrong must give 401."""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from .conftest import PROJECT, make_token


def get(client, token=None, raw_header=None):
    headers = {}
    if raw_header is not None:
        headers["Authorization"] = raw_header
    elif token is not None:
        headers["Authorization"] = f"Bearer {token}"
    return client.get("/api/farmer/me", headers=headers)


def test_no_token_is_401_with_error_shape(client):
    r = get(client)
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "unauthorized", "message": "Please sign in again"}}
    assert r.headers["www-authenticate"] == "Bearer"


def test_valid_token_reaches_handler(client):
    assert get(client, make_token()).status_code == 404  # signed in, no profile yet


now = int(time.time())
other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.mark.parametrize("token", [
    make_token(exp=now - 3600),                                   # expired
    make_token(iat=now + 3600),                                   # issued in the future
    make_token(auth_time=now + 3600),                             # signed in in the future
    make_token(aud="other-project"),                              # wrong audience
    make_token(iss="https://securetoken.google.com/other"),       # wrong issuer
    make_token(sub=""),                                           # empty uid
    make_token(sub="x" * 129),                                    # uid too long
    make_token(auth_time=None),                                   # missing auth_time
    make_token(key=other_key),                                    # forged signature
    make_token(kid="unknown-kid"),                                # unknown key id
    "not.a.jwt",
    "",
])
def test_bad_tokens_rejected(client, token):
    assert get(client, token).status_code == 401


def test_alg_none_rejected(client):
    t = jwt.encode({"sub": "x", "aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}",
                    "iat": now, "exp": now + 60, "auth_time": now}, key=None, algorithm="none")
    assert get(client, t).status_code == 401


def test_hs256_with_public_key_rejected(client):
    """Classic key-confusion attack: HMAC-sign with the RSA public key."""
    t = jwt.encode({"sub": "x"}, "secret", algorithm="HS256", headers={"kid": "test-kid"})
    assert get(client, t).status_code == 401


@pytest.mark.parametrize("header", ["Basic abc", "Bearer", "bearer  ", "Token " + make_token()])
def test_malformed_headers(client, header):
    assert get(client, raw_header=header).status_code == 401


def test_oversized_token(client):
    assert get(client, "a" * 5000).status_code == 401


def test_jwks_cached(client, net):
    for _ in range(5):
        get(client, make_token())
    assert net.jwks_calls == 1


def test_forged_kids_cannot_force_refetches(client, net):
    """Live finding: an unknown kid used to trigger a fetch to Google on every request."""
    get(client, make_token())  # first fetch
    for i in range(20):
        assert get(client, make_token(kid=f"forged-{i}")).status_code == 401
    assert net.jwks_calls == 1


def test_google_unreachable_without_cached_keys_is_503(client, net):
    net.jwks_ok = False
    r = get(client, make_token())
    assert r.status_code == 503 and r.json()["error"]["code"] == "auth_unavailable"
    for _ in range(10):  # and it doesn't hammer Google while down
        get(client, make_token())
    assert net.jwks_calls == 1


def test_cached_keys_survive_google_outage(client, net):
    assert get(client, make_token()).status_code == 404  # keys fetched and cached
    net.jwks_ok = False
    client.app.state.verifier._expires_at = 0  # cache expired, Google down
    client.app.state.verifier._last_attempt = -1e9
    assert get(client, make_token()).status_code == 404  # still verified with cached keys


def test_auth_disabled_dev_mode(make_client):
    c = make_client(env="development", auth_disabled=True, firebase_project_id="")
    assert c.get("/api/farmer/me").status_code == 404  # dev user, no profile


def test_production_refuses_disabled_auth(tmp_path):
    from .conftest import make_settings
    with pytest.raises(RuntimeError):
        make_settings(tmp_path, env="production", auth_disabled=True).check_safe()
    with pytest.raises(RuntimeError):
        make_settings(tmp_path, env="production", data_key="").check_safe()
