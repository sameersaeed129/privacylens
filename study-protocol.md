# Study protocol

## Design
One independent variable: interface (A nested settings, B privacy dashboard). Choose one design:
- **Between subjects:** each participant uses one interface; odd IDs get A, even IDs get B. Needs more participants.
- **Within subjects:** each participant uses both; odd IDs do A then B, even IDs B then A. Needs fewer participants and gives more statistical power, but allow a short break between parts.

Task order is shuffled per participant and interface (reproducible from the ID).

## Participants
Adults who use or could use smart home devices. Recruit 12 to 20 per condition. Record only an ID, and optionally age range and smart home experience on a separate sheet.

## Procedure (about 10 minutes)
1. Explain the study and get consent. Say that the app is being tested, not the participant.
2. Participant opens the app and enters their ID. Do not tell them which interface they have.
3. Five tasks, each from the same starting state. Do not help. Participants may skip a task.
4. SUS questionnaire and optional comment.
5. Short interview (5 minutes, optional): What was easy? What was confusing? How much did you trust what the app showed? Would you change any settings at home after this?

## Measures
| Measure | Source |
|---|---|
| Task success (0/1) | Automatic state check |
| Time on task (s) | Automatic |
| Clicks per task | Automatic |
| Usability (SUS, 0 to 100) | Questionnaire |
| Understanding and trust | Interview, coded by theme |

## Analysis plan
Descriptive statistics with `analysis/analyze.py`. `analysis/analyze.py` picks the test automatically: Mann-Whitney U and per-task Fisher's exact test (between subjects), or Wilcoxon signed-rank (within subjects). Confirm key results in R, SPSS, or `scipy`. Report effect sizes and confidence intervals, and include what did not work.

## Pilot
Run 2 or 3 pilot sessions first. Check that the task wording is clear and fix problems before the main study.

## Limitations to report
- The devices are simulated, so findings apply to the interfaces, not to real hardware.
- The explained alerts (extension) are rule-based illustrations, not a real anomaly detector, and are switched off during the study.
- P-values use a normal approximation. With fewer than about 8 participants per group, treat them as approximate and confirm key results in R, SPSS, or `scipy`.
- Interface B shows more information than interface A by design. This is the thing being tested.
- `data/sample_results.csv` is synthetic and must not be reported as real data.
