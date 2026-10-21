# Power Apps and Power BI implementation examples

These examples accompany [Derick Kopischke's public CMMS simulation](https://derick-kopischke.fitsky18.chatgpt.site/cmms-demo/). They document a possible Microsoft implementation; the public demo itself uses JavaScript. These files are **not** a published canvas app, `.msapp`, `.pbix`, employer export, or Microsoft tenant-validated deployment.

## Power Apps request interface

1. In a development environment, create a SharePoint list **CMMS Demo Requests**. Retain the built-in numeric ID and Created fields. Add text columns `AssetCode`, `Department`, `Priority`, and `RequestStatus`, plus date/time `DueAt`; use `Title` for the summary.
2. Create a canvas app connected to that list. Add classic controls `txtSummary`, `ddAsset`, `ddDepartment`, `ddPriority`, and `btnSubmit`.
3. Set dropdown Items to single-column Value tables with the fictional assets from the browser demo, departments Maintenance / Mold Shop / Melt Shop, and Normal / High / Critical priorities. Require selections.
4. Adapt `PowerFx.fx` to the field types, internal names, controls, and formula separators of the environment. Test both successful submissions and permission/network failures. Text and SharePoint Choice fields require different record shapes.
5. Add a separate work-order list keyed to the request's numeric ID, and an event list. Create a reviewed-request flow for work-order creation; enforce one linked order per request and handle retries idempotently. Create the order before writing the linked ID back to the request. Use an explicit processing state/error recovery path for partial failure.
6. For work-order status changes, validate permitted transitions and update the request only when the values differ. Prevent trigger loops and duplicate events. SharePoint updates across lists are not an atomic database transaction; handle partial failures and retries.

The Power Fx file implements **request submission only**. The remaining app screens and flow steps are design guidance, not included deployable automations. Actual role permissions, approval rules, delegation, concurrent updates and error handling need environment-specific validation.

## Power BI reports

1. Download this repository and open Power BI Desktop. Import `Requests.csv` as **Requests** and `WorkOrders.csv` as **WorkOrders**. These are generated from the same fictional fixture as the browser demo. Regenerate them with `node microsoft-examples/export-samples.mjs` if needed.
2. Keep IDs and Department as text. Convert `SubmittedAt`, `CreatedAt`, `DueAt`, and `ClosedAt` from ISO-8601 UTC text to Date/Time. In Power Query, use `DateTimeZone.RemoveZone(DateTimeZone.FromText(_))` on nonblank timestamp values, preserving UTC; map blank ClosedAt values to null. Set DowntimeMinutes to a numeric type, keeping blanks null. Do not convert these timestamps to local time.
3. Create a Department dimension with the three unique values and a **one-to-many, single-direction** relationship to each fact table's Department column. Do not connect Requests directly to WorkOrders for this reporting model. Use the dimension in the department slicer and department chart.
4. Add each expression in `Measures.dax` separately. `ReportDates` is a calculated table; the others are measures. Keep ReportDates **disconnected**, so backlog measures can see work created before the selected period. Do not filter snapshot CurrentStatus for historical backlog.
5. Add a Between date slicer. A daily view selects one day. A weekly view selects Monday through Sunday (clipped at the sample clock). A monthly view selects the calendar month (also clipped). Selections must be contiguous. Bookmarking three report pages is one way to present the different cadences.
6. Add cards for Requests submitted, Work orders closed, Open work orders, and Overdue work orders; a clustered column chart with ReportDates[Date] and submitted/closed measures; a bar chart with Department and Recorded downtime minutes; and a table of order IDs and dates for inspection.
7. Validate the initial October 19–21 weekly report: **3 requests submitted, 2 orders closed, 8 open orders, 6 overdue orders, 135 recorded downtime minutes**. October-to-date totals are **21 requests, 17 closed orders, 8 open orders, 6 overdue orders, 795 minutes**. These counts apply to the unchanged fixture and all departments. No browser session edits are included in the static imports.

`Events.csv` provides timestamped status history if extending historical status breakdowns. `EventSequence` resolves events sharing a timestamp. The supplied summary measures do not use that table. CurrentStatus in Requests.csv is a present-day snapshot, not historical status.

## Publishing a real Microsoft demo

Use only fictional data. A canvas app can be embedded, but app sharing and appropriate viewer rights still apply; an iframe does not grant access. A Power BI public Publish to web report requires suitable licensing and tenant settings and exposes its underlying model publicly. Secure embedding has different viewer access requirements. Neither service is connected to this repository or portfolio demo.

Reports here are generated on demand. No scheduled refresh, subscription, email delivery, or recurring job is configured. Use the native service's settings if adding that capability later.

Microsoft references:

- [Power Fx Patch](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-patch)
- [Power Fx error handling](https://learn.microsoft.com/en-us/power-platform/power-fx/error-handling)
- [DAX COUNTROWS](https://learn.microsoft.com/en-us/dax/countrows-function-dax)
- [DAX FILTER](https://learn.microsoft.com/en-us/dax/filter-function-dax/)
- [Embed canvas apps](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/embed-apps-dev)
- [Share canvas apps with guests](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/share-app-guests)
- [Power BI Publish to web](https://learn.microsoft.com/en-us/power-bi/collaborate-share/service-publish-to-web)
