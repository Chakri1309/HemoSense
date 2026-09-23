"""Vercel serverless entrypoint: homepage + fallback router.

Also serves /api/index and /api/index.py natively (no rewrite needed).
Path normalization lives on app.wsgi_app inside app.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402  (Vercel looks for `app` in api/*.py)
