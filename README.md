# PrivacyLens

[![CI](https://github.com/sameersaeed129/privacylens/actions/workflows/ci.yml/badge.svg)](https://github.com/sameersaeed129/privacylens/actions/workflows/ci.yml)

A research kit for an HCI study on smart home privacy controls: a working web app with two interfaces, a built-in study procedure, and a statistics script.

**Research question:** Do people understand and manage the privacy settings of cameras and sensors better with a visual privacy dashboard than with the usual nested settings menus?

| Condition | Interface |
|---|---|
| **A: baseline** | Nested settings: Settings > Devices > device > Advanced > Data and privacy |
| **B: PrivacyLens** | One dashboard: live count of recording sensors, privacy score, per-device switches, quick actions (all cameras off, away mode, private mode) |

| Start screen | Interface A | Interface B (with explained alerts demo) |
|---|---|---|
| ![start](docs/img/start.png) | ![A](docs/img/interface-a.png) | ![B](docs/img/interface-b.png) |

**Hypotheses:** B gives (H1) a higher SUS score, (H2) a higher task success rate, and (H3) faster completion with fewer clicks than A.

## Quick start

No build step and no dependencies for the app. Python 3.9+ and Node 18+ are needed only for analysis and tests.

```bash
git clone https://github.com/sameersaeed129/privacylens.git && cd privacylens
npm start            # serves the app at http://localhost:8000
npm install          # once, to get the test dependency
npm test             # 10 Node tests (incl. browser-style end-to-end) + 11 Python tests
```

You can also open `app/index.html` directly. After you enable GitHub Pages (Settings > Pages > Source: GitHub Actions), every push to `main` publishes the app at `https://sameersaeed129.github.io/privacylens/`.

## Running a session

1. Enter a participant ID (`P01`, `P02`, ...) and choose a design:
   - **Between subjects:** one interface per participant. Odd IDs get A, even IDs get B.
   - **Within subjects:** every participant uses both. Odd IDs do A then B, even IDs do B then A.
2. The participant does 5 timed tasks (turn off a microphone, set retention to 7 days, stop cloud sharing, count active sensors, switch off all cameras). **Task order is shuffled per participant** (reproducible from the ID) to reduce learning effects.
3. After each interface, the participant answers the 10-item System Usability Scale (SUS) and may add a comment.
4. Download the CSV and save it in `data/participants/` (git-ignored, so real data is never committed).

Success, time, clicks, and task position are recorded automatically. Data stays in the browser until the participant downloads it.

## Analysis

```bash
python3 analysis/analyze.py data/participants/*.csv
python3 analysis/analyze.py data/sample_results.csv    # synthetic demo data
```

The script reports SUS, success rate, time, and clicks per interface. It detects the design automatically:
- between subjects: Mann-Whitney U (plus Cohen's d) and per-task Fisher's exact tests
- within subjects: Wilcoxon signed-rank test (plus paired effect size dz)

P-values use a normal approximation, so treat them as approximate with fewer than about 8 participants per group. Check important results in R, SPSS, or `scipy`.

`data/sample_results.csv` is **synthetic** and only shows the file format. Never report it as real data.

## Extension: explained alerts

Interface B can show rule-based alerts with a "Why am I seeing this?" explanation and one-tap fixes (demo mode only: tick the box on the start screen). The alerts are illustrative, not output of a real anomaly detector. Plug your own detector into `ALERTS` and `alerts()` in `app/model.js` to study explainable alerts. It is off during the study so it does not confound the A/B comparison.

## Project structure

```
app/        index.html, style.css, model.js (logic), app.js (UI and study flow)
analysis/   analyze.py (standard library only)
tests/      model.test.js, ui.test.js (end-to-end), test_analyze.py
data/       sample_results.csv (synthetic), participants/ (your real data, git-ignored)
docs/       study-protocol.md, img/
.github/    ci.yml (tests), pages.yml (deploy app to GitHub Pages)
```

## Limitations

Please state these in any report or thesis that uses this project:

- **Simulated devices.** Results show how people use the interfaces, not how real cameras and sensors behave.
- **Illustrative alerts.** The explained alerts in interface B are rule-based demos, not the output of a real anomaly detector.
- **Approximate p-values.** The statistics use a normal approximation. With fewer than about 8 participants per group, treat them as approximate and confirm key results in R, SPSS, or `scipy`.
- **Interface B shows more information than A by design.** That difference is what is being tested, but say so clearly.
- **Sample size.** Aim for 12 to 20 participants per condition (between subjects) or in total (within subjects).
- **Synthetic sample data.** `data/sample_results.csv` is made up and must never be reported as real results.

## Ethics

Get ethics approval or supervisor sign-off first, collect no personal data beyond a participant ID, and tell participants they may stop at any time. See `docs/study-protocol.md`.

## License

MIT
