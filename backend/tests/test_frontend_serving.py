"""Demo mode: the API serves the built web app on its own origin."""

import json

import pytest

from .conftest import auth

INDEX = "<!doctype html><title>Arth</title><div id=root></div>"


@pytest.fixture
def dist(tmp_path):
    root = tmp_path / "frontend"
    d = root / "dist"
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text(INDEX, encoding="utf-8")
    (d / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (d / "sw.js").write_text("self.addEventListener('fetch', () => {})", encoding="utf-8")
    (root / "security-headers.json").write_text(json.dumps({
        "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
        "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
        "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    }), encoding="utf-8")
    (tmp_path / "secret.txt").write_text("do not serve", encoding="utf-8")
    return d


@pytest.fixture
def app_client(make_client, dist):
    return make_client(frontend_dist=dist)


def test_app_routes_serve_index_with_page_policy(app_client):
    for path in ("/", "/schemes", "/mandi/onion"):
        r = app_client.get(path)
        assert r.status_code == 200 and "<div id=root>" in r.text, path
        # The page policy, not the API's: mic/camera and the sign-in popup must work.
        assert r.headers["content-security-policy"] == "default-src 'self'; frame-ancestors 'none'"
        assert "microphone=(self)" in r.headers["permissions-policy"]
        assert r.headers["cross-origin-opener-policy"] == "same-origin-allow-popups"
        assert r.headers["cache-control"] == "no-cache"


def test_build_files_cache_forever_but_sw_revalidates(app_client):
    r = app_client.get("/assets/index-abc123.js")
    assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
    assert app_client.get("/sw.js").headers["cache-control"] == "no-cache"


def test_missing_files_and_traversal_are_404(app_client):
    assert app_client.get("/logo-missing.png").status_code == 404
    assert app_client.get("/assets/nope.js").status_code == 404
    assert app_client.get("/../secret.txt").status_code == 404
    assert app_client.get("/%2e%2e/secret.txt").status_code == 404


def test_api_keeps_its_own_rules(app_client):
    r = app_client.get("/api/health")
    assert r.headers["content-security-policy"].startswith("default-src 'none'")
    assert "microphone=()" in r.headers["permissions-policy"]
    r = app_client.get("/api/no-such-route")
    assert r.status_code == 404 and "<div id=root>" not in r.text  # never the web page
    assert app_client.get("/api/farmer/me").status_code == 401


def test_only_the_api_is_rate_limited(make_client, dist):
    client = make_client(frontend_dist=dist, rate_limit_rps=0.001, rate_limit_burst=3)
    # first load: the service worker fetches every build file at once
    assert all(client.get("/assets/index-abc123.js").status_code == 200 for _ in range(30))
    codes = [client.get("/api/health").status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and 429 in codes


def test_no_build_no_app(client):
    assert client.get("/").status_code == 404
    assert client.get("/api/farmer/me", headers=auth()).status_code == 404  # no profile yet: API unaffected


def test_real_page_policy_allows_google_sign_in():
    """Live finding: script-src 'self' blocked apis.google.com, so the sign-in popup never finished."""
    from pathlib import Path
    real = Path(__file__).resolve().parents[2] / "frontend" / "security-headers.json"
    csp = {d.split()[0]: d.split()[1:] for d in
           json.loads(real.read_text(encoding="utf-8"))["Content-Security-Policy"].split("; ")}
    assert "https://apis.google.com" in csp["script-src"]
    assert "https://*.firebaseapp.com" in csp["frame-src"]
    assert any("googleapis.com" in s for s in csp["connect-src"])
