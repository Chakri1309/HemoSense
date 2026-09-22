# 🩸 HemoSense — AI Anaemia Detection (Flask + HTML/CSS/JS)

Premium animated Flask web app + high-accuracy ML.

**Pipeline:** Input (Hb, MCV, MCH, MCHC, Age, …) → Cleaning → Prediction
(SVM / Decision Tree / KNN / Gradient Boosting) → SHAP + LIME explanation →
Verdict + confidence/risk + top drivers.

## Quickstart

```bash
cd HemoSense
pip install -r requirements.txt
python src/generate_data.py
python src/train.py
python app.py
# → http://127.0.0.1:5000
```

## Structure
- `app.py` — Flask app (`/` home, `/predict` form POST, `/api/predict` JSON, `/api/metrics`, `/health`)
- `templates/index.html` — premium animated UI (Chart.js gauges/bars)
- `static/css/style.css` — glassmorphism + blobs + particles + animations
- `static/js/main.js` — sliders, fetch predict, SHAP/LIME charts, arena
- `src/generate_data.py` — synthetic dataset (6000 rows)
- `src/train.py` — trains 4 models, picks best → `models/`
- `src/predict.py` — cleaning + inference
- `src/explain.py` — SHAP + LIME (graceful fallback if libs missing)

> ⚕️ Screening aid only — not a diagnosis.
