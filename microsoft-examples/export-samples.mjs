// Regenerate fictional Power BI import fixtures from the browser demonstration.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {seedRecords,csv,currentState} from '../browser-demo/engine.mjs';
const rows=seedRecords();
const files={
  'Requests.csv':[['RequestID','Summary','Asset','Department','Priority','SubmittedAt','DueAt','CurrentStatus'],...rows.map(r=>[r.id,r.summary,r.asset,r.department,r.priority,r.submittedAt,r.dueAt,currentState(r)])],
  'WorkOrders.csv':[['WorkOrderID','RequestID','Department','CreatedAt','DueAt','ClosedAt','DowntimeMinutes'],...rows.filter(r=>r.orderId).map(r=>[r.orderId,r.id,r.department,r.orderCreatedAt,r.dueAt,r.closedAt,r.downtimeMinutes])],
  'Events.csv':[['RequestID','EventSequence','At','Status','Note'],...rows.flatMap(r=>r.history.map((e,i)=>[r.id,i+1,e.at,e.status,e.note]))]
};
for(const [name,data] of Object.entries(files))writeFileSync(fileURLToPath(new URL(name,import.meta.url)),csv(data)+'\r\n');
console.log(`Exported ${rows.length} fictional requests, ${rows.filter(r=>r.orderId).length} work orders, and event history.`);
