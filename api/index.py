"""Vercel serverless entrypoint — exposes the Flask WSGI app."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402  (Vercel looks for `app` in api/index.py)


class VercelRewriteFix:
    """Vercel forwards the *rewritten* path (/api/index...) to the function.

    Strip that prefix so Flask sees the original route (/, /api/predict,
    /static/..., ...). Handles the prefix split across SCRIPT_NAME/PATH_INFO
    or an empty PATH_INFO. No-op when the original path is already intact.
    """

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO") or ""
        script = environ.get("SCRIPT_NAME") or ""
        full = (script.rstrip("/") + "/" + path.lstrip("/")) if script else path
        if full == "/api/index" or full.startswith("/api/index/"):
            rest = full[len("/api/index"):] or "/"
            environ["SCRIPT_NAME"] = ""
            environ["PATH_INFO"] = rest
        elif path and not path.startswith("/"):
            environ["PATH_INFO"] = "/" + path
        return self.wsgi_app(environ, start_response)


app.wsgi_app = VercelRewriteFix(app.wsgi_app)
