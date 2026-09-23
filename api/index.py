"""Vercel serverless entrypoint — exposes the Flask WSGI app."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402  (Vercel looks for `app` in api/index.py)


class VercelRewriteFix:
    """Vercel forwards the *rewritten* path (/api/index...) to the function.

    Strip that prefix so Flask sees the original route (/, /api/predict,
    /static/..., ...). No-op when the original path is already intact.
    """

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "") or ""
        if path == "/api/index":
            environ["PATH_INFO"] = "/"
        elif path.startswith("/api/index/"):
            environ["PATH_INFO"] = path[len("/api/index"):]
        return self.wsgi_app(environ, start_response)


app.wsgi_app = VercelRewriteFix(app.wsgi_app)
