"""HemoSense explanations: SHAP + LIME."""
import os
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES = ["Age", "Gender", "Haemoglobin", "MCV", "MCH", "MCHC", "RDW", "RBC", "HCT", "Ferritin"]

def shap_values(model, X_bg, x_instance):
    """Return (values array, base_value). Works for tree + generic models."""
    try:
        import shap
        if "GradientBoosting" in type(model).__name__ or "Tree" in type(model).__name__ or "Forest" in type(model).__name__:
            ex = shap.TreeExplainer(model)
            sv = ex.shap_values(x_instance)
            if isinstance(sv, list):
                sv = sv[1] if len(sv) > 1 else sv[0]
            sv = np.array(sv).ravel()
            base = float(ex.expected_value[1] if isinstance(ex.expected_value, (list, np.ndarray)) else ex.expected_value)
            return sv, base
        # fallback: permutation / kernel on small background
        bg = X_bg[np.random.choice(len(X_bg), min(60, len(X_bg)), replace=False)]
        ex = shap.KernelExplainer(lambda z: model.predict_proba(z)[:, 1], shap.kmeans(bg, 10) if len(bg) > 10 else bg)
        sv = ex.shap_values(x_instance, nsamples=150)
        return np.array(sv).ravel(), float(ex.expected_value)
    except Exception as e:
        # pure-model fallback: normalized (mean - x) * coef-ish importance
        imp = np.abs(x_instance.ravel() - X_bg.mean(axis=0))
        imp = imp / (imp.sum() + 1e-9)
        return imp * 0.4, 0.5

def lime_explanation(model, X_bg, x_instance, feature_names=FEATURES):
    try:
        from lime.lime_tabular import LimeTabularExplainer
        explainer = LimeTabularExplainer(
            X_bg, feature_names=feature_names, class_names=["Not Anaemia", "Anaemia"],
            mode="classification", discretize_continuous=True, random_state=42)
        exp = explainer.explain_instance(x_instance.ravel(), model.predict_proba, num_features=len(feature_names))
        return exp.as_list(), exp
    except Exception as e:
        return [], None
