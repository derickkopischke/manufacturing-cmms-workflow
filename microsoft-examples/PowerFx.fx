// Reference code for a canvas app. Not an importable app or tenant-tested formula.
// Setup uses a SharePoint list called 'CMMS Demo Requests' with TEXT columns
// Title, AssetCode, Department, Priority, RequestStatus and DATE/TIME DueAt.
// Classic controls: txtSummary, ddAsset, ddDepartment, ddPriority, btnSubmit.
// Dropdown Items must be single-column Value tables matching the browser options.
// Use a new fictional demo list, not an employer list. Adapt field types/internal
// names and regional separators in the target environment.

// btnSubmit.OnSelect
If(
    Len(Trim(txtSummary.Text)) < 5 || Len(Trim(txtSummary.Text)) > 120,
    Notify("Enter a summary between 5 and 120 characters.", NotificationType.Error),
    IfError(
        Patch(
                'CMMS Demo Requests',
                Defaults('CMMS Demo Requests'),
                {
                    Title: Trim(txtSummary.Text),
                    AssetCode: ddAsset.Selected.Value,
                    Department: ddDepartment.Selected.Value,
                    Priority: ddPriority.Selected.Value,
                    RequestStatus: "New",
                    DueAt: DateAdd(Now(), 2, TimeUnit.Days)
                }
        ),
        Notify("The request could not be saved. Please try again.", NotificationType.Error); Blank(),
        Notify("Request submitted for review.", NotificationType.Success);
        Reset(txtSummary); Blank()
    )
)

// Suggested gallery Items (basic example; delegation must be assessed for scale)
// Filter('CMMS Demo Requests', RequestStatus <> "Closed")

// Work-order creation and linked status changes belong in a separate guarded
// workflow using the SharePoint item ID, not a client-generated count or title.
// See README.md for idempotency and synchronization requirements.
