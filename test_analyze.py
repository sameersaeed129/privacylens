import os
import sys
import unittest

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "analysis"))
import analyze  # noqa: E402


def make_rows(pid, cond, sus, ok=1):
    rows = [dict(participant=pid, condition=cond, type="task", item="T1", success=str(ok), time_s="10.0", clicks="4")]
    rows += [dict(participant=pid, condition=cond, type="sus", item=f"Q{i + 1}", score=str(v)) for i, v in enumerate(sus)]
    return rows


class SusTests(unittest.TestCase):
    def test_best_and_neutral(self):
        self.assertEqual(analyze.sus_score([5, 1] * 5), 100.0)
        self.assertEqual(analyze.sus_score([3] * 10), 50.0)
        self.assertEqual(analyze.sus_score([1, 5] * 5), 0.0)

    def test_invalid(self):
        with self.assertRaises(ValueError):
            analyze.sus_score([3] * 9)
        with self.assertRaises(ValueError):
            analyze.sus_score([6] + [3] * 9)


class StatsTests(unittest.TestCase):
    def test_cohens_d(self):
        self.assertAlmostEqual(analyze.cohens_d([2, 4, 6], [1, 3, 5]), 0.5)
        self.assertIsNone(analyze.cohens_d([1], [2, 3]))
        self.assertIsNone(analyze.cohens_d([1, 1], [1, 1]))

    def test_summarize(self):
        rows = make_rows("P01", "A", [3] * 10, ok=0) + make_rows("P02", "B", [5, 1] * 5)
        s = analyze.summarize(rows)
        self.assertEqual(s["A"]["sus"], [50.0])
        self.assertEqual(s["B"]["sus"], [100.0])
        self.assertEqual(s["A"]["success_rate"], 0.0)
        self.assertEqual(s["B"]["median_time"], 10.0)

    def test_incomplete_sus_ignored(self):
        rows = make_rows("P01", "A", [3] * 10)[:-2]
        self.assertEqual(analyze.summarize(rows)["A"]["sus"], [])


class SignificanceTests(unittest.TestCase):
    def test_mann_whitney(self):
        u, p = analyze.mann_whitney_u([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
        self.assertEqual(u, 0)
        self.assertTrue(0.005 < p < 0.02)
        self.assertEqual(analyze.mann_whitney_u([1, 1, 1], [1, 1, 1])[1], 1.0)

    def test_wilcoxon(self):
        self.assertTrue(analyze.wilcoxon_signed_rank([1, 2, 3, 4, 5, 6, 7, 8])[1] < 0.05)
        self.assertEqual(analyze.wilcoxon_signed_rank([0, 0, 0])[1], 1.0)

    def test_fisher(self):
        self.assertAlmostEqual(analyze.fisher_exact(3, 1, 1, 3), 0.4857, places=3)
        self.assertAlmostEqual(analyze.fisher_exact(10, 0, 0, 10), 2 / 184756, places=8)

    def test_between_and_within_detection(self):
        rows = []
        for i in range(1, 7):
            rows += make_rows(f"P{i}", "A", [3] * 10) + make_rows(f"Q{i}", "B", [5, 1] * 5)
        c = analyze.compare(rows)
        self.assertFalse(c["paired"])
        self.assertLess(c["metrics"]["sus"]["p"], 0.05)
        rows = []
        for i in range(1, 7):
            rows += make_rows(f"P{i}", "A", [3] * 10) + make_rows(f"P{i}", "B", [4, 2] * 5)
        c = analyze.compare(rows)
        self.assertTrue(c["paired"])
        self.assertEqual(c["metrics"]["sus"]["test"], "Wilcoxon signed-rank")

    def test_compare_needs_both_conditions(self):
        self.assertIsNone(analyze.compare(make_rows("P1", "A", [3] * 10)))


class SampleDataTests(unittest.TestCase):
    def test_sample_file_runs(self):
        path = os.path.join(ROOT, "data", "sample_results.csv")
        rows = analyze.load_rows(path)
        s = analyze.summarize(rows)
        self.assertEqual(set(s), {"A", "B"})
        self.assertGreater(s["B"]["sus_mean"], s["A"]["sus_mean"])
        text = analyze.report(s, analyze.compare(rows))
        self.assertIn("Mann-Whitney U", text)
        self.assertIn("Fisher", text)
        self.assertEqual(analyze.main([path]), 0)


if __name__ == "__main__":
    unittest.main()
