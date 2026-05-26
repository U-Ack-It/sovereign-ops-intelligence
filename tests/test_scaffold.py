from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ScaffoldTest(unittest.TestCase):
    def test_sovereign_modules_import(self):
        import sovereign
        import sovereign.db
        import sovereign.estate
        import sovereign.homewatch
        import sovereign.reports
        import sovereign.security
        import sovereign.vendor_audit
        import sovereign.vendors

        self.assertIsNotNone(sovereign)

    def test_expected_project_files_exist(self):
        expected_files = [
            "README.md",
            "AGENTS.md",
            "requirements.txt",
            "app.py",
            "data/vendors.csv",
            "data/estates.csv",
            "data/homewatch_properties.csv",
        ]

        missing = [path for path in expected_files if not (ROOT / path).is_file()]

        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
