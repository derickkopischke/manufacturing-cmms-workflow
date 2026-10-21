"""Behavior checks for linked records, workflow rules, and saved data."""

import contextlib
import io
import sqlite3
import tempfile
import unittest
from pathlib import Path

from cmms import CMMS, main, run_demo


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.cmms = CMMS(":memory:")
        self.addCleanup(self.cmms.close)
        self.request = self.cmms.create_request(
            "Inspect camera mount", "DEMO-CAMERA-01", "Maintenance", "High"
        )

    def test_request_starts_new_and_creating_an_order_synchronizes_it(self):
        self.assertEqual(self.cmms.get_request(self.request)["status"], "New")
        order = self.cmms.create_order(self.request)
        self.assertEqual(self.cmms.get_order(order)["request_id"], self.request)
        self.assertEqual(self.cmms.get_order(order)["status"], "Open")
        self.assertEqual(self.cmms.get_request(self.request)["status"], "Open")

    def test_full_workflow_keeps_both_records_synchronized_and_records_history(self):
        order = self.cmms.create_order(self.request)
        self.cmms.assign(order, "Maintenance")
        for status in ("In Progress", "On Hold", "In Progress", "Closed"):
            self.cmms.update_status(order, status)
            self.assertEqual(self.cmms.get_order(order)["status"], status)
            self.assertEqual(self.cmms.get_request(self.request)["status"], status)
        events = self.cmms.history(self.request)
        self.assertEqual(len(events), 7)
        self.assertEqual(events[-1]["details"], "In Progress -> Closed")

    def test_only_one_work_order_can_be_created_for_a_request(self):
        self.cmms.create_order(self.request)
        with self.assertRaisesRegex(ValueError, "already has work order"):
            self.cmms.create_order(self.request)
        self.assertEqual(len(self.cmms.list_orders()), 1)
        self.assertEqual(len(self.cmms.history(self.request)), 2)

    def test_missing_request_cannot_create_an_orphan_order(self):
        with self.assertRaisesRegex(ValueError, "does not exist"):
            self.cmms.create_order(999)
        self.assertEqual(self.cmms.list_orders(), [])

    def test_work_cannot_skip_from_open_to_closed(self):
        order = self.cmms.create_order(self.request)
        with self.assertRaisesRegex(ValueError, "Cannot change"):
            self.cmms.update_status(order, "Closed")
        self.assertEqual(self.cmms.get_request(self.request)["status"], "Open")
        self.assertEqual(len(self.cmms.history(self.request)), 2)

    def test_unassigned_work_on_hold_cannot_start(self):
        order = self.cmms.create_order(self.request)
        self.cmms.update_status(order, "On Hold")
        with self.assertRaisesRegex(ValueError, "Assign a department"):
            self.cmms.update_status(order, "In Progress")
        self.assertEqual(self.cmms.get_order(order)["status"], "On Hold")

    def test_reassignment_preserves_progress_and_holds(self):
        order = self.cmms.create_order(self.request)
        self.cmms.assign(order, "Maintenance")
        self.cmms.update_status(order, "In Progress")
        self.cmms.assign(order, "Mold Shop")
        self.assertEqual(self.cmms.get_request(self.request)["status"], "In Progress")
        self.cmms.update_status(order, "On Hold")
        self.cmms.assign(order, "Melt Shop")
        self.assertEqual(self.cmms.get_order(order)["status"], "On Hold")
        self.assertEqual(self.cmms.get_order(order)["assigned_group"], "Melt Shop")

    def test_closed_work_cannot_be_reassigned_or_reopened(self):
        order = self.cmms.create_order(self.request)
        self.cmms.assign(order, "Maintenance")
        self.cmms.update_status(order, "In Progress")
        self.cmms.update_status(order, "Closed")
        with self.assertRaisesRegex(ValueError, "cannot be reassigned"):
            self.cmms.assign(order, "Mold Shop")
        with self.assertRaisesRegex(ValueError, "Cannot change"):
            self.cmms.update_status(order, "In Progress")

    def test_failure_between_linked_updates_rolls_back_the_entire_change(self):
        order = self.cmms.create_order(self.request)
        self.cmms.assign(order, "Maintenance")
        self.cmms.db.execute("""
            CREATE TRIGGER reject_request_update BEFORE UPDATE OF status ON requests
            WHEN NEW.status = 'In Progress'
            BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;
        """)
        with self.assertRaises(sqlite3.IntegrityError):
            self.cmms.update_status(order, "In Progress")
        self.assertEqual(self.cmms.get_order(order)["status"], "Assigned")
        self.assertEqual(self.cmms.get_request(self.request)["status"], "Assigned")
        self.assertEqual(len(self.cmms.history(self.request)), 3)

    def test_invalid_inputs_do_not_create_records(self):
        cases = [
            (" ", "ASSET", "Maintenance", "Normal"),
            ("Issue", "", "Maintenance", "Normal"),
            ("Issue", "ASSET", "Unknown", "Normal"),
            ("Issue", "ASSET", "Maintenance", "Urgent"),
        ]
        for values in cases:
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.cmms.create_request(*values)
        self.assertEqual(len(self.cmms.list_requests()), 1)


class PersistenceAndDemoTests(unittest.TestCase):
    def test_records_and_history_survive_reopening_the_database(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "saved.db"
            cmms = CMMS(path)
            request = cmms.create_request("Inspect mount", "DEMO-01", "Maintenance")
            order = cmms.create_order(request)
            cmms.assign(order, "Maintenance")
            cmms.close()
            reopened = CMMS(path)
            try:
                self.assertEqual(reopened.get_request(request)["status"], "Assigned")
                self.assertEqual(len(reopened.history(request)), 3)
            finally:
                reopened.close()

    def test_demo_creates_three_examples_and_refuses_to_overwrite_existing_work(self):
        cmms = CMMS(":memory:")
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                run_demo(cmms)
            self.assertEqual([row["status"] for row in cmms.list_requests()],
                             ["Closed", "In Progress", "On Hold"])
            with self.assertRaisesRegex(ValueError, "empty database"):
                run_demo(cmms)
            self.assertEqual(len(cmms.list_requests()), 3)
        finally:
            cmms.close()

    def test_cli_demo_can_be_followed_by_a_separate_list_command(self):
        with tempfile.TemporaryDirectory() as folder:
            database = str(Path(folder) / "cli.db")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main(["--db", database, "demo"]), 0)
                self.assertEqual(main(["--db", database, "list", "orders"]), 0)
            self.assertIn("DEMO-CAMERA-01", output.getvalue())
            self.assertIn("Closed", output.getvalue())


if __name__ == "__main__":
    unittest.main()
