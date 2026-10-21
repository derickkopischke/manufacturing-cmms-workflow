# CMMS app and reporting simulation

[Open the public demo](https://derick-kopischke.fitsky18.chatgpt.site/cmms-demo/)

This JavaScript portfolio example shows the workflow behind a Power Apps request interface and a Power BI maintenance report. It does **not** run Power Apps or Power BI. All 51 starting requests, assets, dates and downtime entries are fictional. Session changes remain in memory and disappear when the page reloads or sample data is reset. No Microsoft account, company data or external service is used.

## Try a complete workflow

1. Submit a request, then select **Create & assign work order**.
2. Start work. Optionally place it on hold, then resume.
3. Enter a completion note and downtime minutes, then complete it.
4. Open Reports, choose Daily / Weekly / Monthly, a date and department, then **Generate report**.
5. Download the displayed report CSV, or use Print / save PDF.

## Run locally

From the repository root, run `python -m http.server 8000`, then open `http://localhost:8000/browser-demo/`. A static HTTP server is needed for ES module imports. Node.js 18 or newer runs the checks without extra packages:

```sh
node --test browser-demo/engine.test.mjs
```

## Reporting rules

The fixed sample clock is October 21, 2026 at 17:00 UTC. Daily windows start at midnight UTC; weeks start Monday; months start on day 1. Current periods stop at the sample clock, using the next second as an exclusive boundary. Past periods are complete. Reporting dates are available from September 1 through October 21.

- Requests submitted: one row per request submitted in the period.
- Work orders closed: linked orders with a close timestamp in the period.
- Open orders: orders created before cutoff and not closed before cutoff, including older backlog.
- Overdue: open orders whose due timestamp precedes cutoff (or the sample clock for the partial current period).
- Pending: requests that did not yet have a work order at cutoff; these are excluded from order backlog.
- Downtime: minutes entered on orders **closed in the period**. It is not uptime, equipment availability, or MTTR. A recorded zero differs from an uncompleted order with no entry.

The detail register contains period activity plus outstanding work at cutoff. Historical status comes from event history. Future closures and downtime are omitted from historical exports. Counts reconcile across the chart, cards, department view and CSV. Requests and orders are different populations; they should not be subtracted to infer order backlog.

## Scope and implementation

`engine.mjs` contains fixture generation, transitions, time windows, aggregations and CSV serialization. `app.mjs` handles DOM rendering and browser actions. Only one work order per request is allowed; closed work cannot be reopened. Request and order status are represented by one shared history to keep them synchronized. This browser demo is separate from the Python SQLite database and has no production approval, authorization, automated refresh or email delivery.

See [Microsoft implementation examples](../microsoft-examples/) for Power Fx, DAX and fictional import files. These are reference examples; they are not a canvas-app package, `.pbix` file or tenant-validated deployment.
