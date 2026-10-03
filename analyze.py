#!/usr/bin/env python3
"""Analyse PrivacyLens study results (Python standard library only).

Usage:
    python analysis/analyze.py data/sample_results.csv [more.csv ...]

Between-subjects data (each participant saw one interface) is compared with
Mann-Whitney U and per-task Fisher's exact tests. Within-subjects data (every
participant saw both interfaces) is compared with the Wilcoxon signed-rank test.
P-values use the normal approximation with continuity correction, so treat them
as approximate when groups are very small (fewer than about 8 per group).
"""
import argparse
import csv
import math
import statistics
import sys
from collections import defaultdict

LABELS = {"A": "A: nested settings", "B": "B: privacy dashboard"}
METRICS = (("sus", "SUS score"), ("success", "Task success rate"),
           ("time", "Mean time, solved tasks (s)"), ("clicks", "Mean clicks per task"))


def sus_score(scores):
    """System Usability Scale score (0-100) from 10 answers between 1 and 5."""
    if len(scores) != 10 or any(not 1 <= s <= 5 for s in scores):
        raise ValueError("SUS needs 10 answers from 1 to 5")
    return sum((s - 1) if i % 2 == 0 else (5 - s) for i, s in enumerate(scores)) * 2.5


def load_rows(*paths):
    rows = []
    for path in paths:
        with open(path, newline="", encoding="utf-8") as f:
            rows.extend(csv.DictReader(f))
    return rows


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _mean(xs):
    return statistics.fmean(xs) if xs else None


def _sd(xs):
    return statistics.stdev(xs) if len(xs) > 1 else 0.0


def cohens_d(a, b):
    """Cohen's d with pooled SD (a minus b). Returns None if it cannot be computed."""
    if len(a) < 2 or len(b) < 2:
        return None
    pooled = (((len(a) - 1) * statistics.variance(a) + (len(b) - 1) * statistics.variance(b))
              / (len(a) + len(b) - 2)) ** 0.5
    return None if pooled == 0 else (statistics.fmean(a) - statistics.fmean(b)) / pooled


def _ranks(values):
    """Average ranks (1-based) and the sizes of tie groups."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks, ties, i = [0.0] * len(values), [], 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        ties.append(j - i + 1)
        i = j + 1
    return ranks, ties


def _p_from_z(z):
    return math.erfc(max(z, 0.0) / math.sqrt(2))


def mann_whitney_u(a, b):
    """Two-sided Mann-Whitney U test. Returns (U for a, p)."""
    n1, n2 = len(a), len(b)
    if n1 == 0 or n2 == 0:
        raise ValueError("both groups need data")
    ranks, ties = _ranks(list(a) + list(b))
    u1 = sum(ranks[:n1]) - n1 * (n1 + 1) / 2
    n = n1 + n2
    var = n1 * n2 / 12 * ((n + 1) - sum(t ** 3 - t for t in ties) / (n * (n - 1)))
    if var <= 0:
        return u1, 1.0
    return u1, _p_from_z((abs(u1 - n1 * n2 / 2) - 0.5) / math.sqrt(var))


def wilcoxon_signed_rank(diffs):
    """Two-sided Wilcoxon signed-rank test on paired differences. Returns (W, p)."""
    d = [x for x in diffs if x != 0]
    n = len(d)
    if n == 0:
        return 0.0, 1.0
    ranks, ties = _ranks([abs(x) for x in d])
    w_plus = sum(r for r, x in zip(ranks, d) if x > 0)
    w_minus = n * (n + 1) / 2 - w_plus
    var = n * (n + 1) * (2 * n + 1) / 24 - sum(t ** 3 - t for t in ties) / 48
    if var <= 0:
        return min(w_plus, w_minus), 1.0
    return min(w_plus, w_minus), _p_from_z((abs(w_plus - n * (n + 1) / 4) - 0.5) / math.sqrt(var))


def fisher_exact(a, b, c, d):
    """Two-sided Fisher's exact test for the table [[a, b], [c, d]]."""
    r1, c1, n = a + b, a + c, a + b + c + d

    def prob(x):
        return math.comb(c1, x) * math.comb(n - c1, r1 - x) / math.comb(n, r1)

    p_obs = prob(a)
    lo, hi = max(0, r1 - (n - c1)), min(r1, c1)
    return min(1.0, sum(prob(x) for x in range(lo, hi + 1) if prob(x) <= p_obs * (1 + 1e-9)))


def participant_metrics(rows):
    """Return {condition: {participant: metrics}} with one SUS score per participant and condition."""
    tasks, answers, seen = defaultdict(list), defaultdict(dict), set()
    for r in rows:
        cond, pid, kind = r.get("condition"), r.get("participant"), r.get("type")
        if not cond or not pid:
            continue
        seen.add((cond, pid))
        if kind == "task":
            tasks[(cond, pid)].append(r)
        elif kind == "sus":
            item, score = r.get("item") or "", _num(r.get("score"))
            if score is not None and item[1:].isdigit():
                answers[(cond, pid)][int(item[1:])] = score
    out = defaultdict(dict)
    for key in seen:
        cond, pid = key
        got, t = answers.get(key, {}), tasks.get(key, [])
        sus = None
        if sorted(got) == list(range(1, 11)):
            try:
                sus = sus_score([got[i] for i in range(1, 11)])
            except ValueError:
                sus = None
        times = [_num(r.get("time_s")) for r in t if r.get("success") == "1" and _num(r.get("time_s")) is not None]
        clicks = [_num(r.get("clicks")) for r in t if _num(r.get("clicks")) is not None]
        out[cond][pid] = {"sus": sus, "success": _mean([1 if r.get("success") == "1" else 0 for r in t]),
                          "time": _mean(times), "clicks": _mean(clicks), "tasks": t}
    return out


def summarize(rows):
    """Per-condition descriptive results."""
    out = {}
    for cond, people in participant_metrics(rows).items():
        sus = [m["sus"] for _, m in sorted(people.items()) if m["sus"] is not None]
        t = [r for m in people.values() for r in m["tasks"]]
        ok_times = [_num(r["time_s"]) for r in t if r.get("success") == "1" and _num(r.get("time_s")) is not None]
        clicks = [_num(r["clicks"]) for r in t if _num(r.get("clicks")) is not None]
        per_task = defaultdict(list)
        for r in t:
            per_task[r["item"]].append(1 if r.get("success") == "1" else 0)
        out[cond] = {
            "n": len(people), "sus": sus, "sus_mean": _mean(sus), "sus_sd": _sd(sus),
            "success_rate": _mean([1 if r.get("success") == "1" else 0 for r in t]),
            "median_time": statistics.median(ok_times) if ok_times else None,
            "mean_clicks": _mean(clicks),
            "per_task": {k: _mean(v) for k, v in sorted(per_task.items())},
        }
    return out


def compare(rows):
    """Significance tests for B (dashboard) versus A (nested settings). None if one condition is missing."""
    m = participant_metrics(rows)
    A, B = m.get("A", {}), m.get("B", {})
    if not A or not B:
        return None
    paired = set(A) == set(B)
    result = {"paired": paired, "metrics": {}, "fisher": {}}
    for key, _ in METRICS:
        if paired:
            pairs = [(A[p][key], B[p][key]) for p in sorted(A) if A[p][key] is not None and B[p][key] is not None]
            if len(pairs) < 2:
                continue
            a, b = [x for x, _ in pairs], [y for _, y in pairs]
            diffs = [y - x for x, y in pairs]
            sd = _sd(diffs)
            effect, test, p = (_mean(diffs) / sd if sd else None), "Wilcoxon signed-rank", wilcoxon_signed_rank(diffs)[1]
        else:
            a = [x[key] for x in A.values() if x[key] is not None]
            b = [x[key] for x in B.values() if x[key] is not None]
            if len(a) < 2 or len(b) < 2:
                continue
            effect, test, p = cohens_d(b, a), "Mann-Whitney U", mann_whitney_u(b, a)[1]
        result["metrics"][key] = {"test": test, "p": p, "effect": effect,
                                  "median_a": statistics.median(a), "median_b": statistics.median(b)}
    if not paired:
        counts = defaultdict(lambda: {"A": [0, 0], "B": [0, 0]})
        for cond, group in (("A", A), ("B", B)):
            for person in group.values():
                for r in person["tasks"]:
                    counts[r["item"]][cond][0 if r.get("success") == "1" else 1] += 1
        for task, c in sorted(counts.items()):
            result["fisher"][task] = fisher_exact(c["B"][0], c["B"][1], c["A"][0], c["A"][1])
    return result


def _f(value, spec="{:.1f}"):
    return "n/a" if value is None else spec.format(value)


def report(summary, comparison=None):
    lines = []
    for cond in sorted(summary):
        s = summary[cond]
        rate = None if s["success_rate"] is None else s["success_rate"] * 100
        lines += [f"{LABELS.get(cond, cond)}  (n = {s['n']})",
                  f"  SUS mean (SD):        {_f(s['sus_mean'])} ({_f(s['sus_sd'])})",
                  f"  Task success rate:    {_f(rate, '{:.0f}')}%",
                  f"  Median time (solved): {_f(s['median_time'])} s",
                  f"  Mean clicks per task: {_f(s['mean_clicks'])}",
                  "  Success by task:      " + ", ".join(f"{k} {v * 100:.0f}%" for k, v in s["per_task"].items())]
    if comparison:
        design = "within-subjects (paired)" if comparison["paired"] else "between-subjects"
        lines += ["", f"B versus A, {design}"]
        names = dict(METRICS)
        for key, r in comparison["metrics"].items():
            label = "dz" if comparison["paired"] else "d"
            lines.append(f"  {names[key]}: median A {_f(r['median_a'], '{:.2f}')}, B {_f(r['median_b'], '{:.2f}')}; "
                         f"{r['test']} p = {r['p']:.4f}; {label} = {_f(r['effect'], '{:.2f}')}")
        if comparison["fisher"]:
            lines.append("  Per-task success, Fisher's exact p: " + ", ".join(f"{k} {p:.3f}" for k, p in comparison["fisher"].items()))
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", nargs="+", help="one or more result CSV files")
    args = parser.parse_args(argv)
    try:
        rows = load_rows(*args.csv)
    except OSError as exc:
        print(f"Cannot read file: {exc}", file=sys.stderr)
        return 1
    summary = summarize(rows)
    if not summary:
        print("No valid rows found.", file=sys.stderr)
        return 1
    print(report(summary, compare(rows)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
