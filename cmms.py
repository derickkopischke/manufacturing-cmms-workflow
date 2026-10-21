"""A small, local CMMS workflow demonstration using Python and SQLite."""

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


GROUPS = ("Maintenance", "Mold Shop", "Melt Shop")
PRIORITIES = ("Low", "Normal", "High")
TRANSITIONS = {
    "Open": {"Assigned", "On Hold"},
    "Assigned": {"In Progress", "On Hold"},
    "In Progress": {"On Hold", "Closed"},
    "On Hold": {"Assigned", "In Progress"},
    "Closed": set(),
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY,
    summary TEXT NOT NULL,
    asset TEXT NOT NULL,
    requesting_group TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('Low', 'Normal', 'High')),
    status TEXT NOT NULL DEFAULT 'New'
        CHECK (status IN ('New', 'Open', 'Assigned', 'In Progress', 'On Hold', 'Closed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_orders (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id),
    assigned_group TEXT,
    status TEXT NOT NULL DEFAULT 'Open'
        CHECK (status IN ('Open', 'Assigned', 'In Progress', 'On Hold', 'Closed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES requests(id),
    work_order_id INTEGER REFERENCES work_orders(id),
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_request ON events(request_id, id);
"""


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def required_text(value, field, maximum):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required.")
    value = value.strip()
    if len(value) > maximum:
        raise ValueError(f"{field} must be {maximum} characters or fewer.")
    return value


class CMMS:
    """Workflow rules and persistence, separate from the command-line interface."""

    def __init__(self, database="cmms.db"):
        if str(database) != ":memory:":
            database = Path(database).expanduser()
            database.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(database))
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SCHEMA)

    def close(self):
        self.db.close()

    def get_request(self, request_id):
        row = self.db.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
        if row is None:
            raise ValueError(f"Request {request_id} does not exist.")
        return dict(row)

    def get_order(self, order_id):
        row = self.db.execute("SELECT * FROM work_orders WHERE id = ?", (order_id,)).fetchone()
        if row is None:
            raise ValueError(f"Work order {order_id} does not exist.")
        return dict(row)

    def _event(self, request_id, order_id, action, details):
        self.db.execute(
            "INSERT INTO events (request_id, work_order_id, action, details, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (request_id, order_id, action, details, timestamp()),
        )

    def _sync_status(self, order, status):
        """Called inside a transaction so both records change together."""
        now = timestamp()
        self.db.execute(
            "UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?",
            (status, now, order["id"]),
        )
        self.db.execute(
            "UPDATE requests SET status = ?, updated_at = ? WHERE id = ?",
            (status, now, order["request_id"]),
        )

    def create_request(self, summary, asset, requesting_group, priority="Normal"):
        summary = required_text(summary, "Summary", 200)
        asset = required_text(asset, "Asset", 100)
        if requesting_group not in GROUPS:
            raise ValueError("Choose a supported requesting group: " + ", ".join(GROUPS))
        if priority not in PRIORITIES:
            raise ValueError("Choose a supported priority: " + ", ".join(PRIORITIES))
        now = timestamp()
        with self.db:
            cursor = self.db.execute(
                "INSERT INTO requests (summary, asset, requesting_group, priority, "
                "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (summary, asset, requesting_group, priority, now, now),
            )
            request_id = cursor.lastrowid
            self._event(request_id, None, "Request created", f"{asset}: {summary}")
        return request_id

    def create_order(self, request_id):
        with self.db:
            self.get_request(request_id)
            existing = self.db.execute(
                "SELECT id FROM work_orders WHERE request_id = ?", (request_id,)
            ).fetchone()
            if existing:
                raise ValueError(f"Request {request_id} already has work order {existing['id']}.")
            now = timestamp()
            cursor = self.db.execute(
                "INSERT INTO work_orders (request_id, created_at, updated_at) VALUES (?, ?, ?)",
                (request_id, now, now),
            )
            order_id = cursor.lastrowid
            self._sync_status(self.get_order(order_id), "Open")
            self._event(request_id, order_id, "Work order created", f"Work order {order_id} opened")
        return order_id

    def assign(self, order_id, group):
        if group not in GROUPS:
            raise ValueError("Choose a supported assignment group: " + ", ".join(GROUPS))
        with self.db:
            order = self.get_order(order_id)
            if order["status"] == "Closed":
                raise ValueError("Closed work orders cannot be reassigned.")
            self.db.execute(
                "UPDATE work_orders SET assigned_group = ?, updated_at = ? WHERE id = ?",
                (group, timestamp(), order_id),
            )
            # Reassignment preserves existing progress or a hold.
            status = "Assigned" if order["status"] == "Open" else order["status"]
            self._sync_status(order, status)
            previous = order["assigned_group"] or "Unassigned"
            self._event(order["request_id"], order_id, "Assignment changed", f"{previous} -> {group}")

    def update_status(self, order_id, new_status):
        with self.db:
            order = self.get_order(order_id)
            current = order["status"]
            if new_status not in TRANSITIONS[current]:
                allowed = ", ".join(sorted(TRANSITIONS[current])) or "none (order is closed)"
                raise ValueError(f"Cannot change {current} to {new_status}. Allowed next states: {allowed}.")
            if new_status in {"Assigned", "In Progress", "Closed"} and not order["assigned_group"]:
                raise ValueError("Assign a department before moving work forward.")
            self._sync_status(order, new_status)
            self._event(order["request_id"], order_id, "Status changed", f"{current} -> {new_status}")

    def list_requests(self):
        return [dict(row) for row in self.db.execute(
            "SELECT id, asset, summary, requesting_group, priority, status FROM requests ORDER BY id"
        )]

    def list_orders(self):
        return [dict(row) for row in self.db.execute(
            "SELECT w.id, w.request_id, r.asset, w.assigned_group, w.status "
            "FROM work_orders w JOIN requests r ON r.id = w.request_id ORDER BY w.id"
        )]

    def history(self, request_id):
        self.get_request(request_id)
        return [dict(row) for row in self.db.execute(
            "SELECT * FROM events WHERE request_id = ? ORDER BY id", (request_id,)
        )]


def print_table(rows):
    if not rows:
        print("No records yet.")
        return
    columns = list(rows[0])
    values = [[str(row[key]) if row[key] is not None else "Unassigned" for key in columns] for row in rows]
    headers = [key.replace("_", " ").upper() for key in columns]
    widths = [min(42, max(len(headers[i]), *(len(row[i]) for row in values))) for i in range(len(columns))]
    for row in [headers] + values:
        print(" | ".join((value if len(value) <= width else value[:width - 3] + "...").ljust(width)
                         for value, width in zip(row, widths)))


def run_demo(cmms):
    if cmms.list_requests():
        raise ValueError("The demo needs an empty database. Choose a new filename with --db.")
    sample_file = Path(__file__).with_name("sample_requests.json")
    samples = json.loads(sample_file.read_text(encoding="utf-8"))
    if not isinstance(samples, list) or len(samples) != 3:
        raise ValueError("The sample workflow expects exactly three request records.")
    orders = []
    for sample in samples:
        request_id = cmms.create_request(**sample)
        order_id = cmms.create_order(request_id)
        cmms.assign(order_id, sample["requesting_group"])
        orders.append(order_id)
    cmms.update_status(orders[0], "In Progress")
    cmms.update_status(orders[0], "Closed")
    cmms.update_status(orders[1], "In Progress")
    cmms.update_status(orders[2], "On Hold")
    print("Sample workflow complete. All equipment and requests are fictional.\n")
    print("WORK REQUESTS")
    print_table(cmms.list_requests())
    print("\nWORK ORDERS")
    print_table(cmms.list_orders())


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="cmms.db", help="SQLite database filename (default: cmms.db)")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="Create the database tables")
    request = commands.add_parser("request", help="Submit a work request")
    request.add_argument("--summary", required=True)
    request.add_argument("--asset", required=True)
    request.add_argument("--group", choices=GROUPS, required=True)
    request.add_argument("--priority", choices=PRIORITIES, default="Normal")
    order = commands.add_parser("order", help="Create one linked work order for a request")
    order.add_argument("--request", type=int, required=True)
    assign = commands.add_parser("assign", help="Assign or reassign a work order")
    assign.add_argument("--order", type=int, required=True)
    assign.add_argument("--group", choices=GROUPS, required=True)
    status = commands.add_parser("status", help="Update an order and its linked request together")
    status.add_argument("--order", type=int, required=True)
    status.add_argument("--to", choices=tuple(TRANSITIONS), required=True)
    listing = commands.add_parser("list", help="Show work requests or work orders")
    listing.add_argument("entity", choices=("requests", "orders"))
    history = commands.add_parser("history", help="Show a request's complete workflow history")
    history.add_argument("--request", type=int, required=True)
    commands.add_parser("demo", help="Run the fictional sample workflow in an empty database")
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    cmms = None
    try:
        cmms = CMMS(args.db)
        if args.command == "init":
            print(f"Database ready: {args.db}")
        elif args.command == "request":
            request_id = cmms.create_request(args.summary, args.asset, args.group, args.priority)
            print(f"Created work request {request_id}.")
        elif args.command == "order":
            print(f"Created work order {cmms.create_order(args.request)} for request {args.request}.")
        elif args.command == "assign":
            cmms.assign(args.order, args.group)
            print(f"Work order {args.order} assigned to {args.group}.")
        elif args.command == "status":
            cmms.update_status(args.order, args.to)
            print(f"Work order {args.order} and its linked request are now {args.to}.")
        elif args.command == "list":
            print_table(cmms.list_requests() if args.entity == "requests" else cmms.list_orders())
        elif args.command == "history":
            for event in cmms.history(args.request):
                print(f"{event['created_at']} | {event['action']} | {event['details']}")
        elif args.command == "demo":
            run_demo(cmms)
    except (ValueError, sqlite3.Error, OSError, KeyError, TypeError) as error:
        parser.exit(2, f"Error: {error}\n")
    finally:
        if cmms is not None:
            cmms.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
