import {CLOCK,DEPARTMENTS,ASSETS,seedRecords,currentState,submitRequest,advance,summarize,reportCSV} from './engine.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(s));
const badge=s=>`<span class="badge ${esc(s.toLowerCase().replaceAll(' ','-'))}">${esc(s)}</span>`;
let records=seedRecords(), selected=records.at(-1).id, cadence='weekly', report;
$('#asset').innerHTML=ASSETS.map(a=>`<option>${a}</option>`).join('');
$('#department').innerHTML=DEPARTMENTS.map(d=>`<option>${d}</option>`).join('');
$('#report-department').innerHTML+=DEPARTMENTS.map(d=>`<option>${d}</option>`).join('');
function notify(text,error=false){$('#message').textContent=text;$('#message').classList.toggle('error',error);}
function showView(name){for(const view of ['app','reports']){$(`#${view}-view`).hidden=view!==name;$(`#${view}-tab`).setAttribute('aria-pressed',String(view===name));}if(name==='reports'&&!report)generate();}
$('#app-tab').addEventListener('click',()=>showView('app'));
$('#reports-tab').addEventListener('click',()=>showView('reports'));
$('#report-shortcut').addEventListener('click',e=>{e.preventDefault();showView('reports');$('#reports-tab').focus();});
function queue(){
  const filter=$('#queue-filter').value;
  const visible=[...records].reverse().filter(r=>filter==='all'||(filter==='new'?currentState(r)==='New':currentState(r)!=='Closed'));
  if(!visible.some(r=>r.id===selected))selected=visible[0]?.id;
  $('#queue').innerHTML=visible.map(r=>`<tr class="${r.id===selected?'selected':''}"><td><b>${esc(r.id)}</b><small>${esc(r.asset)}</small></td><td>${esc(r.department)}</td><td>${badge(currentState(r))}</td><td><button class="row-button" data-select="${r.id}" aria-label="Review ${r.id}" ${r.id===selected?'aria-current="true"':''}>Open ↗</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">No requests match this view.</td></tr>';
  const r=records.find(r=>r.id===selected);if(!r){$('#record-detail').innerHTML='<p class="small">Submit a sample request to start a new workflow.</p>';return;}
  const state=currentState(r);
  const actions=state==='New'?[['create','Create & assign work order']]:state==='Assigned'?[['start','Start work']]:state==='On Hold'?[['start','Resume work']]:state==='In Progress'?[['hold','Place on hold'],['close','Complete work order']]:[];
  $('#record-detail').innerHTML=`<div class="detail-top"><h3>${esc(r.summary)}</h3>${badge(state)}</div><div class="record-meta"><span>${r.id} ${r.orderId?'↔ '+r.orderId:'· No work order yet'}</span><span>${esc(r.department)} · ${esc(r.priority)}</span><span>Due ${date(r.dueAt)}</span></div>${state==='In Progress'?'<div class="close-fields"><div><label for="completion-note">Completion note (required to close)</label><input id="completion-note" maxlength="200" placeholder="Describe the completed work"></div><div><label for="downtime">Downtime (min)</label><input id="downtime" type="number" min="0" max="100000" value="0" step="1"></div></div>':''}<div class="record-actions">${actions.map(([a,label])=>`<button class="button ${a==='hold'?'secondary':''}" data-action="${a}">${label} →</button>`).join('')}${state==='Closed'?`<p class="small">Completed · ${r.downtimeMinutes} recorded downtime minutes. Linked request and work order are both closed.</p>`:''}</div><details class="history"><summary>Request &amp; work-order history (${r.history.length} ${r.history.length===1?'event':'events'})</summary><ol>${r.history.map(e=>`<li><b>${date(e.at)} ${e.at.slice(11,16)} UTC · ${esc(e.status)}</b> — ${esc(e.note)}</li>`).join('')}</ol></details>`;
}
$('#queue').addEventListener('click',e=>{const b=e.target.closest('[data-select]');if(b){selected=b.dataset.select;queue();}});
$('#queue-filter').addEventListener('change',queue);
$('#record-detail').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;try{const r=records.find(r=>r.id===selected);advance(r,b.dataset.action,{note:$('#completion-note')?.value??'',downtimeMinutes:Number($('#downtime')?.value??0)});notify(`${r.id}${r.orderId?' / '+r.orderId:''}: ${currentState(r)}. The linked status and reporting data are updated.`);queue();if(report)generate(true);}catch(error){notify(error.message,true);}});
$('#request-form').addEventListener('submit',e=>{e.preventDefault();try{const r=submitRequest(records,Object.fromEntries(new FormData(e.target)));selected=r.id;$('#queue-filter').value='active';queue();if(report)generate(true);notify(`${r.id} submitted. Select “Create & assign work order” to continue.`);}catch(error){notify(error.message,true);}});
$('#reset').addEventListener('click',()=>{records=seedRecords();selected=records.at(-1).id;$('#queue-filter').value='active';queue();if(report)generate(true);notify('Fictional sample data restored. Session changes were cleared.');});
const stale=()=>{$('#report-stale').hidden=false;};
document.querySelectorAll('[data-cadence]').forEach(b=>b.addEventListener('click',()=>{cadence=b.dataset.cadence;document.querySelectorAll('[data-cadence]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));stale();}));
$('#report-date').addEventListener('change',stale);$('#report-department').addEventListener('change',stale);
$('#generate').addEventListener('click',()=>generate());
function chart(r){
  const width=600,height=220,left=32,right=10,top=14,bottom=36,w=width-left-right,h=height-top-bottom,max=Math.max(1,...r.series.flatMap(s=>[s.submitted,s.closed]));
  const slot=w/r.series.length,bw=Math.min(24,slot*.32),step=Math.max(1,Math.ceil(r.series.length/7));
  const grid=Array.from({length:max+1},(_,n)=>{const y=top+h*(1-n/max);return `<line class="gridline" x1="${left}" y1="${y}" x2="${width-right}" y2="${y}"/><text x="${left-10}" y="${y+3}" text-anchor="end">${n}</text>`;}).join('');
  const bars=r.series.map((s,i)=>{const cx=left+slot*(i+.5);return `<g><rect x="${cx-bw}" y="${top+h-h*s.submitted/max}" width="${bw}" height="${h*s.submitted/max}" fill="#695493"><title>${s.date}: ${s.submitted} requests submitted</title></rect><rect x="${cx+1}" y="${top+h-h*s.closed/max}" width="${bw}" height="${h*s.closed/max}" fill="#345e50"><title>${s.date}: ${s.closed} work orders closed</title></rect>${i%step===0||r.series.length===1?`<text x="${cx}" y="${height-11}" text-anchor="middle">${esc(date(s.date+'T00:00:00Z'))}</text>`:''}</g>`;}).join('');
  const accessible=r.series.map(s=>`${s.date}: ${s.submitted} requests, ${s.closed} closed orders`).join('; ');
  $('#trend').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(accessible)}">${grid}${bars}</svg>`;
}
function renderReport(){
  const r=report;const endLabel=date(Math.min(r.naturalEnd-1,Date.parse(CLOCK)));
  $('#period-label').textContent=`${r.cadence[0].toUpperCase()+r.cadence.slice(1)} · ${date(r.start)}–${endLabel}, 2026 · ${r.department} · ${r.partial?'Partial period through sample clock':'Complete sample period'} · UTC`;
  $('#metrics').innerHTML=[['Requests submitted',r.submitted.length,'Submitted in the period'],['Work orders closed',r.closed.length,'Closed in the period'],['Open work orders',r.open.length,'At the report cutoff'],['Overdue work orders',r.overdue.length,'Open and past due at cutoff']].map(([label,value,note])=>`<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  chart(r);
  const max=Math.max(1,...r.byDepartment.map(d=>d.downtimeMinutes));
  $('#department-chart').innerHTML=r.byDepartment.map(d=>`<div class="department-row"><div class="bar-label"><span>${d.department}</span><b>${d.downtimeMinutes} min</b></div><div class="track" aria-hidden="true"><div class="fill" style="--bar:${100*d.downtimeMinutes/max}%"></div></div><p class="small">${d.closed} orders closed · ${d.open} open at cutoff</p></div>`).join('');
  $('#downtime-total').textContent=`Total: ${r.downtimeMinutes} minutes recorded on ${r.closed.length} closed work orders.`;
  $('#backlog').innerHTML=['Assigned','In Progress','On Hold'].map(s=>`<div>${s}<strong>${r.open.filter(o=>o.history.filter(e=>Date.parse(e.at)<r.end).at(-1)?.status===s).length}</strong></div>`).join('');
  $('#pending-note').textContent=`${r.pending.length} pending request${r.pending.length===1?'':'s'} awaiting a linked work order, excluded from open-order totals.`;
  $('#report-rows').innerHTML=r.rows.slice().reverse().map(o=>`<tr><td><b>${o.id}</b><small>${o.orderCreatedAt&&Date.parse(o.orderCreatedAt)<r.end?o.orderId:'No work order at cutoff'}</small></td><td>${esc(o.summary)}<small>${esc(o.asset)}</small></td><td>${o.department}</td><td>${badge(o.reportStatus)}</td><td>${date(o.dueAt)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No activity or backlog in this sample period and department.</td></tr>';
}
function generate(keepFilters=false){try{const c=keepFilters&&report?report.cadence:cadence;const d=keepFilters&&report?new Date(report.start).toISOString().slice(0,10):$('#report-date').value;const group=keepFilters&&report?report.department:$('#report-department').value;report=summarize(records,c,d,group);renderReport();if(!keepFilters)$('#report-stale').hidden=true;}catch(error){notify(error.message,true);}}
$('#export').addEventListener('click',()=>{if(!report)return;const blob=new Blob(['\uFEFF'+reportCSV(report)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`cmms-${report.cadence}-${new Date(report.start).toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Downloaded the displayed report, including its cutoff, department, totals, and supporting records.');});
$('#print').addEventListener('click',()=>window.print());
queue();
