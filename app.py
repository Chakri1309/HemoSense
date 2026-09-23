"""HemoSense — Flask + HTML/CSS/JS premium anaemia prediction app."""
import os
import json
import joblib
import numpy as np
from flask import Flask, render_template, request, jsonify

from src.predict import predict, FEATURES
from src.explain import shap_values, lime_explanation
from src.report_parser import extract_text_from_pdf, extract_text_from_docx, parse_lab_values

HERE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__,
            template_folder=os.path.join(HERE, "templates"),
            static_folder=os.path.join(HERE, "static"))
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB report limit


class VercelRewriteFix:
    """Strip a /api/index* rewrite prefix so Flask sees the original route.

    Applied here (not in api/*.py) so EVERY entrypoint — local runs and each
    serverless function file — gets it. No-op when the path is already clean.
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


def _read_static(rel):
    """Read a static asset for server-side inlining (zero /static/* dependency)."""
    try:
        with open(os.path.join(HERE, rel), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _drop_icon_assets():
    import re
    import urllib.parse
    raw = _read_static(os.path.join("static", "img", "drop-icon.svg")).strip()
    sized_out = re.sub(r'\s(width|height)="[^"]*"', "", raw)
    sized_out = sized_out.replace("<svg ", '<svg class="dic" aria-hidden="true" ', 1)
    favicon = "data:image/svg+xml," + urllib.parse.quote(re.sub(r">\s+<", "><", raw))
    return sized_out, favicon


DROP_SVG, DROP_FAVICON = _drop_icon_assets()


INLINE_CSS = _read_static(os.path.join("static", "css", "style.css"))
INLINE_GLOBE_JS = _read_static(os.path.join("static", "js", "globe.js"))
INLINE_MAIN_JS = _read_static(os.path.join("static", "js", "main.js"))


def _template_vars(**extra):
    extra.update(inline_css=INLINE_CSS, inline_globe_js=INLINE_GLOBE_JS,
                 inline_main_js=INLINE_MAIN_JS, drop_icon=DROP_SVG,
                 drop_favicon=DROP_FAVICON)
    return extra

# ---------- load artifacts once ----------
def _load_metrics():
    p = os.path.join(HERE, "models", "metrics.json")
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {"best_model": "Decision Tree", "features": FEATURES, "results": {}}

METRICS = _load_metrics()
X_BG = None
_bg_path = os.path.join(HERE, "models", "X_train.npy")
if os.path.exists(_bg_path):
    try:
        X_BG = np.load(_bg_path)
    except Exception:
        X_BG = None

_MODEL_CACHE = {}
def get_model(name: str | None):
    """None -> best model; else one of SVM / Decision Tree / KNN / Gradient Boosting."""
    key = "best" if not name or name.lower().startswith("best") else name
    if key in _MODEL_CACHE:
        return _MODEL_CACHE[key]
    if key == "best":
        path = os.path.join(HERE, "models", "best_model.pkl")
    else:
        path = os.path.join(HERE, "models", f"{key.replace(' ', '_').lower()}.pkl")
        if not os.path.exists(path):
            path = os.path.join(HERE, "models", "best_model.pkl")
    m = joblib.load(path)
    _MODEL_CACHE[key] = m
    return m

def explain_payload(model, Xs, cleaned=None):
    """Return SHAP + LIME data structures ready for Chart.js."""
    shap_list, lime_list, base = [], [], 0.5
    if X_BG is not None:
        try:
            sv, base = shap_values(model, X_BG, Xs)
            idx = np.argsort(np.abs(np.asarray(sv).ravel()))[::-1]
            for i in idx:
                v = float(np.asarray(sv).ravel()[i])
                shap_list.append({"feature": FEATURES[int(i)], "value": round(v, 4)})
        except Exception:
            pass
        try:
            lst, _ = lime_explanation(model, X_BG, Xs)
            for rule, w in (lst or []):
                lime_list.append({"rule": str(rule), "weight": round(float(w), 4)})
            lime_list = sorted(lime_list, key=lambda d: d["weight"])
        except Exception:
            pass
        if not lime_list and shap_list and cleaned:
            # `lime` not installed (e.g. Vercel): derive local rules from SHAP
            # so the LIME panel stays populated with real model attributions.
            try:
                for s in shap_list:
                    f = s["feature"]
                    lime_list.append({"rule": f"{f} = {cleaned.get(f, '')}",
                                      "weight": s["value"]})
                lime_list = sorted(lime_list, key=lambda d: d["weight"])
            except Exception:
                pass
    return shap_list, lime_list, float(base)

def do_predict(payload: dict, engine: str | None):
    eng = None if (not engine or str(engine).lower().startswith("best")) else engine
    res = predict(payload, model_name=eng)
    model = get_model(eng)
    shap_list, lime_list, base = explain_payload(model, res["vector"], res["cleaned"])
    actual = METRICS.get("best_model", "—") if eng is None else eng
    top = shap_list[0] if shap_list else {"feature": "Haemoglobin", "value": 0}
    return {
        "prediction": res["prediction"],
        "label": res["label"],
        "probability": res["probability"],
        "confidence": res["confidence"],
        "risk": res["risk"],
        "engine_requested": engine or "Best (auto)",
        "engine_used": actual,
        "top_driver": top,
        "shap": shap_list,
        "lime": lime_list,
        "base_value": base,
        "cleaned": res["cleaned"],
        "name": res.get("name", ""),
    }

# ---------- routes ----------
@app.route("/")
def index():
    return render_template("index.html", **_template_vars(
        metrics=METRICS, best=METRICS.get("best_model", "—")))

@app.route("/predict", methods=["POST"])
def predict_form():
    """Classic form POST (no-JS fallback) — re-renders page with result."""
    payload = {k: request.form.get(k, "") for k in FEATURES}
    payload["Name"] = request.form.get("Name", "")
    engine = request.form.get("engine", "Best (auto)")
    try:
        result = do_predict(payload, engine)
    except Exception as e:
        result = {"error": str(e)}
    return render_template("index.html", **_template_vars(
        metrics=METRICS, best=METRICS.get("best_model", "—"),
        result=result, form=payload, engine_sel=engine))

@app.route("/api/predict", methods=["POST"])
def api_predict():
    data = request.get_json(force=True, silent=True) or {}
    payload = {k: data.get(k, "") for k in FEATURES}
    payload["Name"] = data.get("Name", "")
    engine = data.get("engine", "Best (auto)")
    try:
        return jsonify({"ok": True, **do_predict(payload, engine)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@app.route("/api/parse-report", methods=["POST"])
@app.route("/api/parse_report", methods=["POST"])
def api_parse_report():
    """Upload a blood-report PDF/DOCX -> extract lab values -> auto-fill + predict continues."""
    f = request.files.get("report")
    if f is None or not f.filename:
        return jsonify({"ok": False, "error": "No file uploaded. Choose a PDF or DOCX report."}), 400
    name = f.filename.lower()
    try:
        if name.endswith(".pdf"):
            text = extract_text_from_pdf(f.stream)
        elif name.endswith(".docx"):
            text = extract_text_from_docx(f.stream)
        else:
            return jsonify({"ok": False, "error": "Unsupported file type. Upload a .pdf or .docx report."}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not read report: {e}"}), 400
    if not text or not text.strip():
        return jsonify({"ok": False, "error": "No readable text found in the report (scanned image?)."}), 400
    parsed = parse_lab_values(text)
    if not parsed["found"]:
        return jsonify({"ok": False, "error": "No lab values detected. The report must mention Hb, MCV, MCH, MCHC, etc.",
                        "text_preview": parsed["text_preview"]}), 422
    return jsonify({"ok": True, **parsed, "filename": f.filename})

@app.route("/api/metrics")
def api_metrics():
    return jsonify(METRICS)

@app.route("/health")
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "best_model": METRICS.get("best_model")})

@app.route("/api/debug")
def debug_path():
    """Temporary diagnostic: show what path/environ the platform passes."""
    e = request.environ
    return jsonify({"PATH_INFO": e.get("PATH_INFO"), "SCRIPT_NAME": e.get("SCRIPT_NAME"),
                    "REQUEST_METHOD": e.get("REQUEST_METHOD"), "path": request.path,
                    "url": request.url})


_CATCHALL_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]

@app.route("/api/index", defaults={"subpath": ""}, methods=_CATCHALL_METHODS)
@app.route("/api/index/<path:subpath>", methods=_CATCHALL_METHODS)
@app.route("/api/index.py", defaults={"subpath": ""}, methods=_CATCHALL_METHODS)
@app.route("/api/index.py/<path:subpath>", methods=_CATCHALL_METHODS)
def _vercel_prefix_catchall(subpath):
    """Serve the app even if the platform forwards the rewrite destination
    (/api/index...) as the request path instead of the original URL."""
    from flask import abort
    target = "/" + subpath
    if target.startswith("/static/"):
        return app.send_static_file(target[len("/static/"):])
    adapter = app.url_map.bind_to_environ(request.environ)
    try:
        endpoint, values = adapter.match(target, method=request.method)
    except Exception:
        abort(404)
    return app.view_functions[endpoint](**values)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
