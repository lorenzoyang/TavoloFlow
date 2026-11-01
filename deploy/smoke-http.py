#!/usr/bin/env python3
"""Real HTTPS/CSRF/cookie checks against the disposable stack, never the live domain.

Connects to loopback while verifying Caddy's local CA and the production hostname.
Only smoke-test credentials and state are written to the private temporary directory.
"""
import base64
import http.client
import http.cookies
import json
import pathlib
import socket
import ssl
import sys
import uuid

phase, directory, port = sys.argv[1:]
root = pathlib.Path(directory)
context = ssl.create_default_context(cafile=str(root / "root.crt"))
# A 16x16 JPEG dish photo; the API re-encodes every upload to a 640x640 WebP.
PHOTO = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0o"
    "MCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABAD"
    "ASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAA"
    "AAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIABk+f/2Q=="
)


class LocalConnection(http.client.HTTPSConnection):
    def connect(self):
        self.sock = context.wrap_socket(
            socket.create_connection(("127.0.0.1", int(port)), timeout=15),
            server_hostname=self.host,
        )


class Browser:
    def __init__(self, cookies=None):
        self.cookies = cookies or {}

    def request(self, method, path, body=None, token=None, status=200):
        headers = {"Cookie": "; ".join(
            f"{name}={value['value']}" for name, value in self.cookies.items()
            if path.startswith(value["path"])
        )}
        raw = isinstance(body, bytes)
        if body is not None:
            headers["Content-Type"] = "image/jpeg" if raw else "application/json"
        if token:
            headers["X-CSRF-TOKEN"] = token
        connection = LocalConnection("app.qiaotavoloflow.it", context=context)
        payload = body if raw or body is None else json.dumps(body)
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        raw_headers = response.getheaders()
        data = response.read()
        assert response.status == status, f"{method} {path}: expected {status}, got {response.status}"
        for name, value in raw_headers:
            if name.lower() == "set-cookie":
                jar = http.cookies.SimpleCookie(value)
                for cookie_name, morsel in jar.items():
                    assert morsel["secure"] and morsel["httponly"], "Production cookie flags missing"
                    assert not morsel["domain"], "Cookies must stay host-only on the business subdomain"
                    self.cookies[cookie_name] = {"value": morsel.value, "path": morsel["path"] or "/"}
        connection.close()
        return {name.lower(): value for name, value in raw_headers}, data

    def read(self, path):
        headers, data = self.request("GET", path)
        assert "no-store" in headers.get("cache-control", "")
        return json.loads(data)

    def write(self, method, path, body, scope="store", status=200):
        csrf = {"store": "/api/auth/csrf", "platform": "/api/platform/auth/csrf", "guest": "/api/public/csrf"}[scope]
        token = self.read(csrf)["token"]
        _, data = self.request(method, path, body, token, status)
        return json.loads(data) if data else None

    def write_json(self, method, path, body, scope="store", status=200):
        result = self.write(method, path, body, scope, status)
        assert isinstance(result, dict), f"{method} {path}: expected a JSON object response"
        return result


browser = Browser()
for path in ["/", "/staff", "/staff/kitchen", "/platform/login", "/q/smoke-qr", "/r/smoke-menu", "/o/smoke-order"]:
    headers, body = browser.request("GET", path)
    assert "text/html" in headers["content-type"] and "no-cache" in headers["cache-control"]
    assert b'rel="manifest"' not in body
for path in ["/assets/not-found.js", "/missing.png", "/staff/not-found.js", "/health/ready"]:
    _, body = browser.request("GET", path, status=404)
    assert b'<div id="root">' not in body
# The API's fallback policy requires authentication, including on unmatched paths.
for path in ["/api", "/api/not-found"]:
    headers, body = browser.request("GET", path, status=401)
    assert "application/json" in headers["content-type"] and "no-store" in headers["cache-control"]
headers, body = browser.request("GET", "/staff.webmanifest")
assert "application/manifest+json" in headers["content-type"] and "no-cache" in headers["cache-control"]
manifest = json.loads(body)
assert all(manifest[key] == "/staff" for key in ["id", "scope", "start_url"])
headers, _ = browser.request("GET", "/sw.js")
assert "javascript" in headers["content-type"] and "no-cache" in headers["cache-control"]
headers, _ = browser.request("GET", "/assets/retained-smoke.js")
assert "immutable" in headers["cache-control"]
# A valid business connection above rules out a generic TLS outage. Other hostnames
# must not acquire certificates or serve the business site from this Caddy instance.
for host in ["qiaotavoloflow.it", "www.qiaotavoloflow.it", "www.app.qiaotavoloflow.it"]:
    connection = LocalConnection(host, context=context)
    try:
        connection.connect()
    except ssl.SSLError:
        pass
    else:
        raise AssertionError(f"VPS unexpectedly provides trusted HTTPS for {host}")
    finally:
        connection.close()

if phase == "create":
    wrong = browser.read("/api/auth/csrf")["token"]
    _, data = browser.request("POST", "/api/platform/auth/login", {
        "username": "smokeadmin", "password": "Deployment-smoke-123"
    }, wrong, status=400)
    assert json.loads(data)["code"] == "CSRF_VALIDATION_FAILED"
    browser.write("POST", "/api/platform/auth/login", {
        "username": "smokeadmin", "password": "Deployment-smoke-123"
    }, "platform")
    restaurant_id = str(uuid.uuid4())
    created = browser.write_json("POST", "/api/platform/restaurants", {
        "id": restaurant_id, "name": "Disposable deployment test", "defaultLanguage": "zh",
        "ownerUsername": "smokeowner", "staffUsername": "smokestaff"
    }, "platform", 201)
    owner = next(x for x in created["credentials"] if x["account"]["role"] == "OWNER")
    browser.write("PATCH", f"/api/platform/restaurants/{restaurant_id}/service-status", {"status": "ACTIVE"}, "platform")
    browser.write("POST", "/api/auth/login", {"username": "smokeowner", "password": owner["temporaryPassword"]})
    browser.write("POST", "/api/auth/change-password", {
        "currentPassword": owner["temporaryPassword"], "newPassword": "Deployment-owner-123"
    })
    browser.request("GET", "/api/not-found", status=404)
    category = browser.write_json("POST", "/api/owner/menu/categories", {
        "nameZh": "冒烟分类", "nameIt": None, "nameEn": None
    }, status=201)
    item = browser.write_json("POST", "/api/owner/menu/items", {
        "categoryId": category["id"], "itemCode": None, "nameZh": "冒烟菜品", "nameIt": None, "nameEn": None,
        "descriptionZh": None, "descriptionIt": None, "descriptionEn": None, "priceCents": 100,
        "allergenCodes": [], "allergenReviewed": True
    }, status=201)
    image_id = browser.write_json("PUT", f"/api/owner/menu/items/{item['id']}/image", PHOTO)["imageId"]
    # Caddy's menu-image route must not add the no-store that every other /api response gets.
    headers, _ = browser.request("GET", f"/api/public/menu-images/{image_id}")
    assert headers["content-type"] == "image/webp" and headers["x-content-type-options"] == "nosniff"
    assert "immutable" in headers["cache-control"] and "no-store" not in headers["cache-control"]
    table = browser.write_json("POST", "/api/owner/tables", {"tableLabel": "Smoke table"}, status=201)
    browser.write("PATCH", "/api/staff/accepting-orders", {"enabled": True})
    opened = browser.write_json("POST", f"/api/staff/tables/{table['id']}/open", None, status=201)
    session_id = opened["session"]["sessionId"]
    token = table["qrPath"].rsplit("/", 1)[-1]
    browser.write("POST", f"/api/public/qr/{token}/join", {
        "sessionId": session_id, "joinCode": opened["joinCode"]
    }, "guest")
    (root / "browser.json").write_text(json.dumps({
        "cookies": browser.cookies, "session": session_id, "code": opened["joinCode"], "restaurant": restaurant_id
    }))
    print("HTTPS routes, cache headers, three identities, CSRF, restaurant creation, dish photo and encrypted join code: passed")
else:
    saved = json.loads((root / "browser.json").read_text())
    browser = Browser(saved["cookies"])
    browser.read("/api/platform/auth/me")
    browser.read("/api/auth/me")
    browser.read(f"/api/public/sessions/{saved['session']}/access")
    assert browser.read(f"/api/staff/sessions/{saved['session']}/join-code")["joinCode"] == saved["code"]
    print("Old static resource, persisted database, all login cookies and join-code decryption: passed")
