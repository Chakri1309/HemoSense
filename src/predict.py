"""HemoSense inference: clean -> convert -> predict."""
import os, joblib
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES = ["Age", "Gender", "Haemoglobin", "MCV", "MCH", "MCHC", "RDW", "RBC", "HCT", "Ferritin"]
RANGES = {
    "Age": (1, 100), "Haemoglobin": (4, 20), "MCV": (55, 115),
    "MCH": (12, 40), "MCHC": (25, 38), "RDW": (10, 22),
    "RBC": (2.0, 7.0), "HCT": (12, 60), "Ferritin": (1, 500),
}

_model, _scaler = None, None

def _load():
    global _model, _scaler
    if _model is None:
        _model = joblib.load(os.path.join(HERE, "models", "best_model.pkl"))
        _scaler = joblib.load(os.path.join(HERE, "models", "scaler.pkl"))
    return _model, _scaler

def clean_and_vectorize(payload: dict):
    """Clean raw user input -> (1,10) scaled vector + cleaned frame."""
    row = {}
    row["Age"] = float(np.clip(float(payload.get("Age", 30)), *RANGES["Age"]))
    g = str(payload.get("Gender", "Female")).strip().lower()
    row["Gender"] = 1 if g.startswith("m") else 0
    for k in ["Haemoglobin", "MCV", "MCH", "MCHC", "RDW", "RBC", "HCT", "Ferritin"]:
        lo, hi = RANGES[k]
        try:
            v = float(payload.get(k, (lo + hi) / 2))
        except (TypeError, ValueError):
            v = (lo + hi) / 2
        if np.isnan(v):
            v = (lo + hi) / 2
        row[k] = float(np.clip(v, lo, hi))
    df = pd.DataFrame([row], columns=FEATURES)
    _, scaler = _load()
    return scaler.transform(df), df

def predict(payload: dict, model_name: str | None = None):
    if model_name:
        import joblib as jb
        path = os.path.join(HERE, "models", f"{model_name.replace(' ', '_').lower()}.pkl")
        model = jb.load(path) if os.path.exists(path) else _load()[0]
        scaler = _load()[1]
        Xs, df = clean_and_vectorize(payload)
        proba = float(model.predict_proba(Xs)[0, 1])
        pred = int(proba >= 0.5)
    else:
        model, _ = _load()
        Xs, df = clean_and_vectorize(payload)
        proba = float(model.predict_proba(Xs)[0, 1])
        pred = int(model.predict(Xs)[0])
    conf = proba if pred == 1 else 1 - proba
    # risk tiers
    risk = "Low" if proba < 0.3 else ("Moderate" if proba < 0.6 else ("High" if proba < 0.85 else "Critical"))
    name = str(payload.get("Name", "") or "").strip()[:60]
    return {"prediction": pred, "label": "Anaemia" if pred == 1 else "Not Anaemia",
            "probability": round(proba, 4), "confidence": round(float(conf), 4),
            "risk": risk, "cleaned": df.to_dict("records")[0], "vector": Xs, "name": name}
