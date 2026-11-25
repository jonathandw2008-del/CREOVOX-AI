from tests.conftest import login_as, make_user


def _create(client, title="My video", **extra):
    r = client.post("/api/projects", json={"project": {"title": title, "description": "", **extra}})
    assert r.status_code == 200, r.text
    return r.json()


def test_create_list_get_update_delete(auth_client):
    p = _create(auth_client)
    assert p["version"] == 1
    assert p["status"] == "uploading"

    listed = auth_client.get("/api/projects").json()
    assert [x["id"] for x in listed] == [p["id"]]

    p["title"] = "Renamed"
    p["highlights"] = [{"id": "h1", "startTime": 1, "endTime": 5, "title": "Hi"}]
    r = auth_client.put(f"/api/projects/{p['id']}", json={"project": p, "version": p["version"]})
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["title"] == "Renamed"
    assert saved["version"] == 2
    assert saved["highlights"][0]["category"] == "key-moment"

    # Stale version → conflict carrying the current copy.
    stale = auth_client.put(f"/api/projects/{p['id']}", json={"project": p, "version": 1})
    assert stale.status_code == 409
    assert stale.json()["error"]["project"]["version"] == 2

    assert auth_client.delete(f"/api/projects/{p['id']}").status_code == 200
    assert auth_client.get(f"/api/projects/{p['id']}").status_code == 404


def test_other_users_projects_are_invisible(auth_client, client, db):
    p = _create(auth_client)
    mallory = make_user(db, "mallory@example.com")
    login_as(client, db, mallory)
    assert client.get(f"/api/projects/{p['id']}").status_code == 404
    assert client.get("/api/projects").json() == []
    assert client.delete(f"/api/projects/{p['id']}").status_code == 404


def test_client_cannot_set_video_file(auth_client):
    p = _create(auth_client, videoFile={"name": "x.mp4", "size": 1, "type": "video/mp4", "duration": 1, "width": 1, "height": 1, "storageKey": "k", "assetId": "evil"})
    assert "videoFile" not in p or not p["videoFile"].get("assetId") == "evil"


def test_duplicate(auth_client):
    p = _create(auth_client, title="Original")
    r = auth_client.post(f"/api/projects/{p['id']}/duplicate")
    assert r.status_code == 200, r.text
    assert r.json()["id"] != p["id"]
    assert "Original" in r.json()["title"]


def test_requires_login(client):
    assert client.get("/api/projects").status_code == 401
