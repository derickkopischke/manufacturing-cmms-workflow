# Manufacturing CMMS Workflow

A Python demonstration by **Derick Kopischke** of how a maintenance request becomes an assigned work order, how status changes stay synchronized, and how a history of the work is recorded.

The focus is the logic behind the workflow. The application runs locally in a terminal and saves its records in SQLite. It uses Python's standard library, with no additional packages to install.

This is a standalone portfolio demonstration using fictional equipment and requests. It is inspired by my manufacturing and CMMS experience; it contains no employer system exports or production records.

## Try the browser app and reporting demo

[Open the interactive CMMS demo](https://derick-kopischke.fitsky18.chatgpt.site/cmms-demo/)

The repository also includes a JavaScript simulation of a Power Apps maintenance workflow and Power BI reporting concept. Submit requests, create linked work orders, record completion and downtime, and generate daily, weekly or monthly reports with department filters and CSV downloads.

The browser demo uses fictional records and runs independently of Microsoft services. [Browser source and tests](browser-demo/) and [Power Fx / DAX reference examples and fictional Power BI import files](microsoft-examples/) are included. The Microsoft examples are not a published app, a .pbix file, or a tenant-validated deployment.

Run the browser checks with Node.js 18 or newer:

```sh
node --test browser-demo/engine.test.mjs
```

The Python and SQLite workflow below remains a separate runnable demonstration.

## Try the sample workflow

Install Python 3.12 or newer with SQLite support. This version was tested with Python 3.12. Download this repository using **Code → Download ZIP**, extract it, and open a terminal in the extracted folder. Alternatively, clone the repository:

```sh
git clone https://github.com/derickkopischke/manufacturing-cmms-workflow.git
cd manufacturing-cmms-workflow
```

Run the demo:

```sh
python cmms.py --db demo.db demo
```

On Windows, use `py` in place of `python` if needed. On macOS or Linux, your command may be `python3`.

The demo creates three requests and linked work orders for Maintenance, Mold Shop, and Melt Shop. Their final statuses are **Closed**, **In Progress**, and **On Hold**. Request and work-order statuses match. See [example output](examples/demo-output.txt) for the result.

Inspect the saved records and the first request's history:

```sh
python cmms.py --db demo.db list requests
python cmms.py --db demo.db list orders
python cmms.py --db demo.db history --request 1
```

The demo requires an empty database and will not overwrite existing work. To repeat it, choose a new filename, such as `--db another-demo.db`.

## Work through it yourself

Use a fresh database for these commands so the first request and order have ID `1`. Put `--db` before the subcommand.

```sh
python cmms.py --db practice.db init
python cmms.py --db practice.db request --summary "Inspect camera mount" --asset DEMO-CAMERA-01 --group Maintenance --priority High
python cmms.py --db practice.db order --request 1
python cmms.py --db practice.db assign --order 1 --group Maintenance
python cmms.py --db practice.db status --order 1 --to "In Progress"
python cmms.py --db practice.db status --order 1 --to Closed
python cmms.py --db practice.db history --request 1
```

For group names containing spaces, use quotes: `--group "Mold Shop"` or `--group "Melt Shop"`.

## Workflow decisions

| Decision | Behavior |
| --- | --- |
| A new request is submitted | It starts as **New**, without a work order. |
| A work order is created | It links to exactly one request. Both records become **Open**. |
| A department is assigned | An open order and its request become **Assigned**. |
| Work starts, pauses, or finishes | Both records change in the same database transaction. |
| A department changes | Existing progress or a hold is preserved. |
| Work is closed | This demonstration does not allow reopening or reassignment. |

The main path is **New request → Open order → Assigned → In Progress → Closed**. An order can also move to **On Hold** from Open, Assigned, or In Progress. From On Hold, it can return to Assigned or In Progress once a department is assigned.

Each request can have one work order. This keeps the relationship simple for the demonstration; a larger CMMS may support multiple orders for one request.

## How it is implemented

- `cmms.py` separates workflow rules from the command-line interface.
- `requests` and `work_orders` are linked by a unique foreign key.
- Related status updates are committed together or rolled back together.
- An `events` table records request creation, work-order creation, assignment changes, and status changes in UTC.
- Parameterized SQL queries bind user input as values.
- `sample_requests.json` supplies the fictional demonstration records.

The event history is an application log. It is not a tamper-proof audit system. This local demonstration also does not include user authentication, approval roles, preventive maintenance scheduling, or a SCADA connection.

## Run the checks

```sh
python -m unittest discover -s tests -v
```

The checks exercise linked status synchronization, duplicate-order prevention, invalid transitions, assignment rules, persistence, the sample workflow, and rollback when one of the linked database updates fails.

## About the author

I'm interested in practical software for manufacturing, including maintenance workflows, production information, and tools that reduce repetitive work.

[Professional portfolio](https://derick-kopischke.fitsky18.chatgpt.site) · [GitHub profile](https://github.com/derickkopischke) · [LinkedIn](https://www.linkedin.com/in/derick-kopischke-84654b2ab/)

