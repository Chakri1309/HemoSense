"""HemoSense training: SVM, Decision Tree, KNN, Gradient Boosting -> best model."""
import json, os
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                             f1_score, roc_auc_score, confusion_matrix, classification_report)

FEATURES = ["Age", "Gender", "Haemoglobin", "MCV", "MCH", "MCHC", "RDW", "RBC", "HCT", "Ferritin"]
TARGET = "Anaemia"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_data():
    p = os.path.join(HERE, "data", "anaemia_dataset.csv")
    if not os.path.exists(p):
        from generate_data import generate
        df = generate()
        os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
        df.to_csv(p, index=False)
    else:
        df = pd.read_csv(p)
    return df

def main():
    df = load_data()
    print(f"Dataset: {df.shape}, prevalence={df[TARGET].mean():.3f}")
    X = df[FEATURES].copy()
    X["Gender"] = X["Gender"].map({"Female": 0, "Male": 1})
    y = df[TARGET].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    models = {
        "SVM": SVC(C=2.0, kernel="rbf", gamma="scale", probability=True, random_state=42),
        "Decision Tree": DecisionTreeClassifier(max_depth=10, min_samples_split=8,
                                                min_samples_leaf=4, random_state=42),
        "KNN": KNeighborsClassifier(n_neighbors=7, weights="distance"),
        "Gradient Boosting": GradientBoostingClassifier(
            n_estimators=220, learning_rate=0.08, max_depth=4,
            min_samples_split=4, subsample=0.9, random_state=42),
    }

    results, trained = {}, {}
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    for name, clf in models.items():
        clf.fit(X_train_s, y_train)
        pred = clf.predict(X_test_s)
        proba = clf.predict_proba(X_test_s)[:, 1]
        cv_acc = cross_val_score(clf, X_train_s, y_train, cv=cv, scoring="accuracy").mean()
        results[name] = {
            "accuracy": round(float(accuracy_score(y_test, pred)), 4),
            "precision": round(float(precision_score(y_test, pred)), 4),
            "recall": round(float(recall_score(y_test, pred)), 4),
            "f1": round(float(f1_score(y_test, pred)), 4),
            "roc_auc": round(float(roc_auc_score(y_test, proba)), 4),
            "cv_accuracy": round(float(cv_acc), 4),
            "confusion_matrix": confusion_matrix(y_test, pred).tolist(),
        }
        trained[name] = clf
        print(f"\n{name}: {results[name]}")
    print("\n" + classification_report(y_test, trained[max(results, key=lambda k: results[k]['accuracy'])].predict(X_test_s)))

    best_name = max(results, key=lambda k: (results[k]["accuracy"], results[k]["roc_auc"]))
    print(f"\n>>> BEST MODEL: {best_name} ({results[best_name]['accuracy']*100:.2f}% accuracy)")

    os.makedirs(os.path.join(HERE, "models"), exist_ok=True)
    joblib.dump(trained[best_name], os.path.join(HERE, "models", "best_model.pkl"))
    joblib.dump(scaler, os.path.join(HERE, "models", "scaler.pkl"))
    # save each model too for comparison tab
    for n, m in trained.items():
        joblib.dump(m, os.path.join(HERE, "models", f"{n.replace(' ', '_').lower()}.pkl"))
    with open(os.path.join(HERE, "models", "metrics.json"), "w") as f:
        json.dump({"best_model": best_name, "features": FEATURES, "results": results}, f, indent=2)
    # save raw train data (scaled + encoded) for LIME/SHAP background
    np.save(os.path.join(HERE, "models", "X_train.npy"), X_train_s)
    X_train.to_csv(os.path.join(HERE, "models", "X_train_raw.csv"), index=False)
    print("Saved models + metrics.json")

if __name__ == "__main__":
    main()
