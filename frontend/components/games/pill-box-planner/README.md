# Pill Box Planner

**Area:** Executive Function  
**Level:** 2 (Medium), the only level for this game  
**Skill:** Rule switching & multi-step cognitive planning  
**Component:** `frontend/components/games/pill-box-planner/index.tsx`  
**Logic & Scoring:** `frontend/components/games/pill-box-planner/logic.ts`  
**Data & Prescriptions:** `frontend/components/games/pill-box-planner/data.ts`  
**Automated Check:** `frontend/lib/pill-box-planner.check.mjs`

---

## Game Overview
Pill Box Planner challenges patients to organize realistic everyday medications into compartmentalized daily pill boxes (Morning 🌅, Afternoon ☀️, Evening 🌆, Bedtime 🌙) according to written and read-aloud medical instructions.

In later rounds, the doctor introduces a **prescription rule switch** (e.g. swapping timing, adding a symptom-dependent medication, or adjusting frequencies), requiring mental flexibility and inhibition of the previously established routine.

---

## Medication Library & Dose Invariants
Every medication in the library is a familiar, clinically realistic medication:
- **Paracetamol**: 500 mg (1 tablet) · Fever and ache relief
- **Metformin**: 500 mg (1 tablet) · Blood sugar balance
- **Amlodipine**: 5 mg (1 tablet) · Blood pressure
- **Omeprazole**: 20 mg (1 capsule) · Gastric comfort
- **Atorvastatin**: 10 mg (1 tablet) · Cholesterol & heart health
- **Calcium + D3**: 500 mg (1 tablet) · Bone strength
- **Vitamin D3**: 60,000 IU (1 capsule) · Wellness
- **Eye Drops**: 2 drops · Eye lubrication
- **Cough Syrup**: 10 ml (2 spoons) · Soothing throat cough

Every medicine satisfies strict validation checks:
1. Valid positive dose amount.
2. Certified clinical dose unit: `mg`, `ml`, `drops`, `tablet`, `tablets`, `capsule`, `capsules`, `IU`.
3. Dedicated shape/form representation, distinct color, and clear purpose description.

---

## Scoring (0–100)
- **Target placements**: Every required (compartment, medicine) pair correctly filled adds to the score.
- **Omissions**: Required pairs left empty incur a penalty.
- **Extra / misplaced pills**: Pills placed into unprescribed compartments incur a 0.5× penalty.
- **Rule Switch tracking**: Omissions and misplaced pills on prescription change rounds are recorded as `switchErrors` to assess cognitive flexibility and perseverance of prior rules.
