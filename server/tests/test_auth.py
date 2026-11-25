from app.routers import auth as auth_router


def test_me_requires_session(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"]


def test_auth_config(client):
    r = client.get("/api/auth/config")
    assert r.status_code == 200
    body = r.json()
    assert body["googleEnabled"] is True
    assert body["emailEnabled"] is True


def test_email_code_sign_in_and_logout(client, monkeypatch):
    sent = {}
    monkeypatch.setattr(auth_router, "send_login_code", lambda email, code: sent.update(email=email, code=code))

    r = client.post("/api/auth/email/start", json={"email": "Bob@Example.com"})
    assert r.status_code == 200, r.text
    assert sent["email"] == "bob@example.com"

    bad = client.post("/api/auth/email/verify", json={"email": "bob@example.com", "code": "000000" if sent["code"] != "000000" else "111111"})
    assert bad.status_code in (400, 401)

    ok = client.post("/api/auth/email/verify", json={"email": "bob@example.com", "code": sent["code"]})
    assert ok.status_code == 200, ok.text
    assert ok.json()["email"] == "bob@example.com"

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "bob@example.com"

    # A code works only once.
    again = client.post("/api/auth/email/verify", json={"email": "bob@example.com", "code": sent["code"]})
    assert again.status_code in (400, 401)

    assert client.post("/api/auth/logout").status_code == 200
    client.cookies.clear()
    assert client.get("/api/auth/me").status_code == 401


def test_cross_origin_write_rejected(auth_client):
    r = auth_client.post("/api/projects", json={"project": {"title": "x"}}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "bad_origin"
