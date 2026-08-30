"""
Minimal auth-gated reverse proxy in front of Ollama.

Ollama itself has no built-in authentication. This listens on a separate
port, forwards a request to Ollama's real port ONLY if it carries the
correct bearer token, and rejects everything else with 401 before it ever
reaches Ollama. Intended to sit behind Tailscale Funnel (which makes this
port reachable from the public internet with no access control of its
own) so the app's OLLAMA_BASE_URL can point at a public HTTPS URL while
still requiring the shared secret on every request.

Stdlib only - no pip install needed. Streams responses through rather
than buffering, so it works with Ollama's streaming endpoints too.

Deployment (see docs/production-notes.md): this does NOT run as part of
the Next.js app or on Vercel. It runs directly on the Ollama host machine
(currently a Windows PC reached over Tailscale), as a Scheduled Task
(`AgensyncOllamaProxy`, trigger ONLOGON), fronted by `tailscale funnel
--bg 11435`. Copy this file to the host and set it up there; nothing here
gets deployed automatically.

One real gotcha found by live testing, not by inspection: launched via
Task Scheduler this runs under pythonw.exe (no console), and
BaseHTTPRequestHandler's default log_message() writes to sys.stderr on
every request - under pythonw.exe that's not just redirected, it's
missing, and the write crashed the handler thread mid-response, causing
every single request to fail with a connection reset even though the
socket accepted the connection fine. log_message() below is a true no-op
because of this, not just "quieter" logging.
"""

import http.server
import os
import socketserver
import urllib.error
import urllib.request

LISTEN_PORT = int(os.environ.get("PROXY_PORT", "11435"))
OLLAMA_URL = os.environ.get("OLLAMA_UPSTREAM", "http://127.0.0.1:11434")
SHARED_SECRET = os.environ["PROXY_SHARED_SECRET"]  # required, no insecure default


class AuthProxyHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _is_authorized(self) -> bool:
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {SHARED_SECRET}"

    def _proxy(self):
        if not self._is_authorized():
            body = b"Unauthorized"
            self.send_response(401)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        request_body = self.rfile.read(content_length) if content_length else None

        upstream_url = OLLAMA_URL + self.path
        forward_headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in ("host", "authorization", "content-length")
        }
        if request_body:
            forward_headers["Content-Length"] = str(len(request_body))

        req = urllib.request.Request(
            upstream_url,
            data=request_body,
            headers=forward_headers,
            method=self.command,
        )

        try:
            with urllib.request.urlopen(req, timeout=300) as upstream:
                self.send_response(upstream.status)
                for key, value in upstream.getheaders():
                    if key.lower() not in ("transfer-encoding", "connection"):
                        self.send_header(key, value)
                self.end_headers()
                while True:
                    chunk = upstream.read(8192)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:  # upstream unreachable, timeout, etc.
            body = f"Proxy error: {e}".encode()
            self.send_response(502)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_GET(self):
        self._proxy()

    def do_POST(self):
        self._proxy()

    def log_message(self, format, *args):
        # True no-op, not just "quiet" logging: under pythonw.exe (used by
        # the scheduled task this runs as) sys.stderr is None, not just
        # redirected - BaseHTTPRequestHandler's default log_message writes
        # to it after every single request, so calling super() here
        # crashes the handler thread mid-response on every request. Found
        # by live testing: curl got connection resets specifically when
        # launched via Task Scheduler, not when run in a normal console.
        pass


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), AuthProxyHandler)
    try:
        # Under pythonw.exe (no console) this can raise on some Python
        # builds - never let a logging statement take the server down.
        print(f"Ollama auth proxy listening on :{LISTEN_PORT}, forwarding to {OLLAMA_URL}")
    except Exception:
        pass
    server.serve_forever()
