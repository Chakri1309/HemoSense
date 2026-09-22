"""HemoSense — synthetic anaemia dataset generator (medically plausible)."""
import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

N = 6000

def generate(n=N):
    rows = []
    for _ in range(n):
        age = int(RNG.integers(1, 91))
        gender = str(RNG.choice(["Male", "Female"], p=[0.48, 0.52]))
        is_male = 1 if gender == "Male" else 0

        # 48% anaemic target prevalence
        anaemic = RNG.random() < 0.48

        if not anaemic:
            hb = RNG.normal(14.6 if is_male else 13.2, 0.9)
            mcv = RNG.normal(90, 4.5)
            mchc = RNG.normal(34.2, 0.9)
            rdw = RNG.normal(12.8, 0.7)
            ferritin = float(np.clip(RNG.normal(120, 55), 32, 320))
            rbc = RNG.normal(5.1 if is_male else 4.6, 0.35)
        else:
            subtype = RNG.choice(["iron", "chronic", "b12", "mixed"], p=[0.55, 0.2, 0.15, 0.1])
            if is_male:
                hb = float(np.clip(RNG.normal(10.4, 1.3), 5.5, 12.9))
            else:
                hb = float(np.clip(RNG.normal(9.6, 1.3), 5.0, 11.9))
            if subtype == "iron":
                mcv = float(np.clip(RNG.normal(72, 5), 60, 79.5))
                mchc = float(np.clip(RNG.normal(30.2, 1.1), 28, 32))
                rdw = float(np.clip(RNG.normal(16.2, 1.1), 14.6, 19.5))
                ferritin = float(np.clip(RNG.normal(14, 6), 3, 28))
                rbc = float(np.clip(RNG.normal(3.7, 0.45), 2.6, 4.4))
            elif subtype == "b12":
                mcv = float(np.clip(RNG.normal(104, 3.5), 100, 110))
                mchc = float(np.clip(RNG.normal(33.8, 0.9), 31.5, 35.5))
                rdw = float(np.clip(RNG.normal(15.6, 1.0), 14.2, 18.5))
                ferritin = float(np.clip(RNG.normal(140, 60), 35, 320))
                rbc = float(np.clip(RNG.normal(3.3, 0.4), 2.5, 4.1))
            elif subtype == "chronic":
                mcv = float(np.clip(RNG.normal(84, 4), 76, 94))
                mchc = float(np.clip(RNG.normal(32.2, 1.0), 29.5, 34))
                rdw = float(np.clip(RNG.normal(14.2, 0.9), 12.5, 16.5))
                ferritin = float(np.clip(RNG.normal(180, 70), 60, 350))
                rbc = float(np.clip(RNG.normal(3.9, 0.4), 2.8, 4.5))
            else:
                mcv = float(np.clip(RNG.normal(78, 7), 62, 95))
                mchc = float(np.clip(RNG.normal(31, 1.2), 28, 33.5))
                rdw = float(np.clip(RNG.normal(15.8, 1.2), 14, 19))
                ferritin = float(np.clip(RNG.normal(22, 12), 4, 45))
                rbc = float(np.clip(RNG.normal(3.6, 0.45), 2.6, 4.3))

        mcv = float(np.clip(mcv, 60, 110))
        # MCH strongly correlated with MCV
        mch = float(np.clip(mcv * 0.33 + RNG.normal(0, 0.8), 15, 36))
        mchc = float(np.clip(mchc, 28, 36))
        rdw = float(np.clip(rdw, 11, 20))
        rbc = float(np.clip(rbc, 2.5, 6.5))
        hb = float(np.clip(hb, 5, 18))
        # HCT ~= Hb * 3
        hct = float(np.clip(hb * 2.95 + RNG.normal(0, 1.2), 15, 55))

        # Ground-truth-ish label with WHO Hb cutoffs + noise
        cutoff = 13.0 if is_male else 12.0
        if age < 12:
            cutoff = 11.5
        rule = 1 if hb < cutoff else 0
        # subtle corrections: severe microcytosis / very low ferritin pushes to anaemia
        if ferritin < 15 and hb < cutoff + 0.4:
            rule = 1
        label = rule
        rows.append([age, gender, hb, mcv, mch, mchc, rdw, rbc, hct, ferritin, label])

    df = pd.DataFrame(rows, columns=[
        "Age", "Gender", "Haemoglobin", "MCV", "MCH", "MCHC",
        "RDW", "RBC", "HCT", "Ferritin", "Anaemia"])
    # 1.5% label noise for realism
    flip = RNG.random(len(df)) < 0.015
    df.loc[flip, "Anaemia"] = 1 - df.loc[flip, "Anaemia"]
    return df

if __name__ == "__main__":
    df = generate()
    df.to_csv("data/anaemia_dataset.csv", index=False)
    print(df.shape)
    print(df["Anaemia"].value_counts(normalize=True))
    print(df.head())
