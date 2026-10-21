// Browser-only portfolio simulation. All times are fictional UTC timestamps.
export const CLOCK = '2026-10-21T17:00:00.000Z';
export const DEPARTMENTS = ['Maintenance', 'Mold Shop', 'Melt Shop'];
export const ASSETS = ['DEMO-CAMERA-01', 'DEMO-MOLD-02', 'DEMO-FURNACE-03', 'DEMO-TRIM-04', 'DEMO-CONVEYOR-05', 'DEMO-GANTRY-06'];
const DAY = 86400000;
const stamp = (t) => new Date(t).toISOString();
const historyEvent = (at, status, note) => ({at: stamp(at), status, note});

export function seedRecords() {
  const titles = ['Inspect camera mount', 'Check coating fixture', 'Inspect furnace door track', 'Check trim sensor alignment', 'Inspect conveyor drive', 'Check gantry part sensor'];
  const records = [];
  for (let i = 0; i < 54; i++) {
    const submitted = Date.UTC(2026, 8, 1 + i, 7 + i % 4);
    const submittedAt = stamp(submitted);
    const isNew = i > 46 && i % 3 === 0;
    const assigned = submitted + 3600000 * (2 + i % 5);
    const closed = assigned + 3600000 * (6 + i % 8 * 5);
    const remainsOpen = i % 9 === 0 || i > 47;
    const completed = !isNew && !remainsOpen && closed <= Date.parse(CLOCK);
    const history = [historyEvent(submitted, 'New', 'Sample request submitted')];
    if (!isNew && assigned <= Date.parse(CLOCK)) {
      history.push(historyEvent(assigned, 'Assigned', 'Linked work order created and department assigned'));
      if (assigned + 3600000 <= Date.parse(CLOCK)) history.push(historyEvent(assigned + 3600000, 'In Progress', 'Work started'));
      if (completed) history.push(historyEvent(closed, 'Closed', 'Sample repair completed and checked'));
      else if (i % 2 === 0 && assigned + 7200000 <= Date.parse(CLOCK)) history.push(historyEvent(assigned + 7200000, 'On Hold', 'Waiting for a sample replacement component'));
    }
    if (submitted > Date.parse(CLOCK)) continue;
    records.push({id: `WR-${String(i+1).padStart(3,'0')}`, summary: titles[i % 6], asset: ASSETS[i % 6], department: DEPARTMENTS[i % 3], priority: ['Normal','High','Critical'][i % 3], submittedAt, dueAt: stamp(submitted + DAY * (2 + i % 4)), orderId: history.length > 1 ? `WO-${String(i+1).padStart(3,'0')}` : null, orderCreatedAt: history.length > 1 ? stamp(assigned) : null, closedAt: completed ? stamp(closed) : null, downtimeMinutes: completed ? (i % 7) * 15 : null, history});
  }
  return records;
}

export function stateAt(record, endExclusive) {
  return record.history.filter(e => Date.parse(e.at) < endExclusive).at(-1)?.status ?? null;
}
export const currentState = r => stateAt(r, Date.parse(CLOCK) + 1000);

export function submitRequest(records, fields) {
  const summary = String(fields.summary ?? '').trim();
  if (summary.length < 5 || summary.length > 120) throw new Error('Use a summary between 5 and 120 characters.');
  if (!ASSETS.includes(fields.asset) || !DEPARTMENTS.includes(fields.department)) throw new Error('Choose a sample asset and department.');
  if (!['Normal','High','Critical'].includes(fields.priority)) throw new Error('Choose a valid priority.');
  const serial = Math.max(0, ...records.map(r=>Number(r.id.split('-')[1]))) + 1;
  const record = {id:`WR-${String(serial).padStart(3,'0')}`, summary, asset:fields.asset, department:fields.department, priority:fields.priority, submittedAt:CLOCK, dueAt:stamp(Date.parse(CLOCK)+DAY*2), orderId:null, orderCreatedAt:null, closedAt:null, downtimeMinutes:null, history:[historyEvent(CLOCK,'New','Sample request submitted')]};
  records.push(record);
  return record;
}

export function advance(record, action, {downtimeMinutes=0, note=''}={}) {
  const state = currentState(record);
  const transitions = {create:{New:'Assigned'}, start:{Assigned:'In Progress','On Hold':'In Progress'}, hold:{'In Progress':'On Hold'}, close:{'In Progress':'Closed'}};
  const next = transitions[action]?.[state];
  if (!next) throw new Error(`This action is unavailable while the request is ${state}.`);
  if (action === 'close' && (!Number.isFinite(downtimeMinutes) || downtimeMinutes < 0 || downtimeMinutes > 100000 || !String(note).trim())) throw new Error('Enter a completion note and downtime of 0–100,000 minutes.');
  if (action === 'create') {record.orderId = record.id.replace('WR-','WO-'); record.orderCreatedAt=CLOCK;}
  if (action === 'close') {record.closedAt=CLOCK; record.downtimeMinutes=downtimeMinutes;}
  const notes = {create:'Linked work order created; department assigned',start:'Work started / resumed',hold:'Work placed on hold',close:String(note).trim()};
  record.history.push(historyEvent(CLOCK,next,notes[action]));
  return record;
}

export function reportWindow(cadence, anchor) {
  const date = new Date(`${anchor}T00:00:00.000Z`);
  if (!['daily','weekly','monthly'].includes(cadence) || !/^\d{4}-\d{2}-\d{2}$/.test(anchor) || !Number.isFinite(+date) || date.toISOString().slice(0,10)!==anchor) throw new Error('Select a valid report date and cadence.');
  const start = new Date(date);
  let end;
  if (cadence==='weekly') {start.setUTCDate(start.getUTCDate() - (start.getUTCDay()+6)%7); end=+start+7*DAY;}
  else if (cadence==='monthly') {start.setUTCDate(1);end=Date.UTC(start.getUTCFullYear(), start.getUTCMonth()+1,1);}
  else end=+start+DAY;
  if (+start > Date.parse(CLOCK)) throw new Error('The selected period is later than the sample clock.');
  return {cadence, start:+start, end:Math.min(end,Date.parse(CLOCK)+1000), naturalEnd:end, partial:end>Date.parse(CLOCK)+1000};
}

export function summarize(records, cadence='weekly', anchor='2026-10-21', department='All') {
  const window=reportWindow(cadence,anchor);
  const population = records.filter(r => (department==='All'||r.department===department) && Date.parse(r.submittedAt)<window.end);
  const submitted = population.filter(r=>Date.parse(r.submittedAt)>=window.start);
  const orders = population.filter(r=>r.orderCreatedAt && Date.parse(r.orderCreatedAt)<window.end);
  const closed = orders.filter(r=>r.closedAt && Date.parse(r.closedAt)>=window.start && Date.parse(r.closedAt)<window.end);
  const open = orders.filter(r=>!r.closedAt || Date.parse(r.closedAt)>=window.end);
  const overdue=open.filter(r=>Date.parse(r.dueAt)<Math.min(window.end,Date.parse(CLOCK)));
  const pending = population.filter(r=>!r.orderCreatedAt || Date.parse(r.orderCreatedAt)>=window.end);
  const rows = population.filter(r => submitted.includes(r)||closed.includes(r)||open.includes(r)||pending.includes(r)).map(r=>({...r,reportStatus:stateAt(r,window.end)}));
  const series=[];
  for (let t=window.start;t<window.end;t+=DAY) {
    const end=Math.min(t+DAY,window.end);
    series.push({date:stamp(t).slice(0,10), submitted:submitted.filter(r=>Date.parse(r.submittedAt)>=t&&Date.parse(r.submittedAt)<end).length, closed:closed.filter(r=>Date.parse(r.closedAt)>=t&&Date.parse(r.closedAt)<end).length});
  }
  const byDepartment=DEPARTMENTS.filter(d=>department==='All'||d===department).map(d=>({department:d,closed:closed.filter(r=>r.department===d).length,open:open.filter(r=>r.department===d).length,downtimeMinutes:closed.filter(r=>r.department===d).reduce((n,r)=>n+r.downtimeMinutes,0)}));
  return {...window,department,submitted,closed,open,overdue,pending,rows,series,byDepartment,downtimeMinutes:closed.reduce((n,r)=>n+r.downtimeMinutes,0)};
}

export function csv(rows) {
  return rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}
export function reportCSV(report) {
  const period=[stamp(report.start),stamp(report.end)];
  return csv([
    ['Fictional CMMS report',report.cadence,'Department',report.department],
    ['Period start UTC',period[0],'Period end exclusive UTC',period[1]],
    ['Requests submitted',report.submitted.length,'Work orders closed',report.closed.length],
    ['Open work orders at cutoff',report.open.length,'Overdue work orders at cutoff',report.overdue.length],
    ['Pending requests at cutoff',report.pending.length,'Downtime minutes on orders closed in period',report.downtimeMinutes],
    [],['Request','Work order','Summary','Asset','Department','Status at cutoff','Submitted UTC','Order created UTC','Due UTC','Closed by cutoff UTC','Downtime minutes if closed by cutoff'],
    ...report.rows.map(r=>[r.id,r.orderCreatedAt&&Date.parse(r.orderCreatedAt)<report.end?r.orderId:'',r.summary,r.asset,r.department,r.reportStatus,r.submittedAt,r.orderCreatedAt&&Date.parse(r.orderCreatedAt)<report.end?r.orderCreatedAt:'',r.dueAt,r.closedAt&&Date.parse(r.closedAt)<report.end?r.closedAt:'',r.closedAt&&Date.parse(r.closedAt)<report.end?r.downtimeMinutes:''])
  ]);
}
