import { useState, useRef, useEffect, useCallback } from "react";

// ─── Supabase config ──────────────────────────────────────────────
const SUPABASE_URL = "https://mmgdnccfjfexodwzojmz.supabase.co";
const SUPABASE_KEY = "sb_publishable_2jPHPdWIWpwUvxfA67ZO8g_fXf-CwGJ";
const TABLE = "tracker_state";
const ROW_ID = 1;

async function sbFetch(path, opts={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(opts.headers||{}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadState() {
  const rows = await sbFetch(`${TABLE}?id=eq.${ROW_ID}&select=data`);
  return rows && rows.length > 0 ? rows[0].data : null;
}

async function saveState(data) {
  await sbFetch(`${TABLE}?id=eq.${ROW_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ data }),
  });
}

async function initRow(data) {
  await sbFetch(TABLE, {
    method: "POST",
    headers: { "Prefer": "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ id: ROW_ID, data }),
  });
}

// ─── Constants ────────────────────────────────────────────────────
const MEMBERS = [
  "Coppola, Quentin",
  "Garbarine, Ian",
  "Tanifum, Eric",
  "Ng, Crystal",
  "Torres, Jahleel",
  "Williams, Erin",
];

const CATEGORIES = [
  "Conceptualization","Methodology","Software","Validation",
  "Formal Analysis","Investigation","Data Curation",
  "Writing – Original Draft","Writing – Review & Editing","Visualization",
];

const CAT_DESC = {
  "Conceptualization": "Ideas; formulation or evolution of overarching research goals and objectives.",
  "Methodology": "Development or design of methodology; creation of models and protocols.",
  "Software": "Programming; software development; implementation of computer code and algorithms; and testing of existing code components.",
  "Validation": "Verification of the overall replication/reproducibility of results/experiments and other research outputs.",
  "Formal Analysis": "Application of statistical, mathematical, computational, or other formal techniques to analyze or synthesize study data.",
  "Investigation": "Conducting a research and investigation process, specifically performing the experiments or data/evidence collection.",
  "Data Curation": "Management activities to annotate, scrub, and maintain research data for initial use and later reuse.",
  "Writing – Original Draft": "Preparation, creation, and/or presentation of the published work — specifically writing the initial draft.",
  "Writing – Review & Editing": "Preparation, creation, and/or presentation of the published work — specifically critical review, commentary, or revision.",
  "Visualization": "Preparation, creation, and/or presentation of the published work — specifically visualization and data presentation.",
};

const STATUSES   = ["Not Started","In Progress","On Hold","Complete"];
const PRIORITIES = ["High","Medium","Low"];

const STATUS_COLORS = {
  "Not Started": { bg:"#e5e7eb", text:"#6b7280" },
  "In Progress":  { bg:"#fef3c7", text:"#92400e" },
  "On Hold":      { bg:"#fee2e2", text:"#991b1b" },
  "Complete":     { bg:"#d1fae5", text:"#065f46" },
};
const PRIORITY_COLORS = {
  "High":   { bg:"#fee2e2", text:"#991b1b" },
  "Medium": { bg:"#fef3c7", text:"#92400e" },
  "Low":    { bg:"#d1fae5", text:"#065f46" },
};
const MEMBER_COLORS = [
  { bg:"#dbeafe", text:"#1e40af" },
  { bg:"#ede9fe", text:"#5b21b6" },
  { bg:"#fce7f3", text:"#9d174d" },
  { bg:"#d1fae5", text:"#065f46" },
  { bg:"#fed7aa", text:"#92400e" },
  { bg:"#e0f2fe", text:"#0c4a6e" },
];

// ─── Data normalization / migrations ─────────────────────────────
const ROTATION_START_ISO = "2026-02-22";

function isoDate(d) {
  if (!d) return "";
  const dt = typeof d === "string"
    ? new Date(d + (d.includes("T") ? "" : "T00:00:00"))
    : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function addDaysISO(dateStr, days) {
  const dt = new Date(String(dateStr) + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return String(dateStr || "");
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

function normalizeMeetingNotes(mnRaw) {
  const base = emptyMeetingNotes();
  const mn = (mnRaw && typeof mnRaw === "object") ? mnRaw : {};
  return {
    ...base,
    ...mn,
    attendees: Array.isArray(mn.attendees) ? mn.attendees : [],
    agendaItems: Array.isArray(mn.agendaItems) ? mn.agendaItems : [],
    actionItems: Array.isArray(mn.actionItems) ? mn.actionItems : [],
    decisions: Array.isArray(mn.decisions) ? mn.decisions : [],
    questions: Array.isArray(mn.questions) ? mn.questions : [],
  };
}

function normalizeWeek(wRaw) {
  const w = (wRaw && typeof wRaw === "object") ? wRaw : {};
  return {
    id: w.id || uid(),
    date: isoDate(w.date) || ROTATION_START_ISO,
    shortRows: Array.isArray(w.shortRows) ? w.shortRows : makeRows(3),
    longRows: Array.isArray(w.longRows) ? w.longRows : makeRows(3),
    meetingNotes: normalizeMeetingNotes(w.meetingNotes),
  };
}

function normalizeAndMigrateState(data) {
  if (!data || typeof data !== "object") return null;
  const weeksRaw = Array.isArray(data.weeks) ? data.weeks : [];
  let weeks = weeksRaw.map(normalizeWeek);

  // Migration: older saved data started at 2026-02-15. Shift forward one week.
  if (weeks.length > 0 && isoDate(weeks[0].date) === "2026-02-15") {
    weeks = weeks.map(w => ({ ...w, date: addDaysISO(w.date, 7) }));
  }

  if (weeks.length === 0) {
    weeks = makeInitWeeks().map(normalizeWeek);
  }

  const ids = new Set(weeks.map(w => w.id));
  const activeWeekId = (data.activeWeekId && ids.has(data.activeWeekId))
    ? data.activeWeekId
    : weeks[weeks.length - 1].id;

  return { weeks, activeWeekId };
}

function getMeetingDates() {
  // Meeting rotation should start the week of Feb 22, 2026
  const dates = []; let d = new Date(2026,1,22);
  const end = new Date(2026,5,30);
  while (d <= end) { dates.push(new Date(d)); d.setDate(d.getDate()+7); }
  return dates;
}
const MEETING_DATES   = getMeetingDates();
const LEADERS_ASC     = [...MEMBERS].sort((a,b)=>a.split(",")[0].localeCompare(b.split(",")[0]));
const NOTETAKERS_DESC = [...MEMBERS].sort((a,b)=>b.split(",")[0].localeCompare(a.split(",")[0]));

const ZOOM_LINK = "https://miami.zoom.us/j/93853903712?pwd=vAJBlQI5bkn7MeGZI44ZCvRI2fvAVl.1";
const ZOOM_ID   = "938 5390 3712";
const ZOOM_PASS = "057434";

const AGENDA_CATEGORIES = [
  "Check-in & Attendance",
  "Short-Term Task Updates",
  "Long-Term Goals & Milestones Update",
  "Data Review & Analysis",
  "Methods & Protocol Discussion",
  "Writing & Publication Updates",
  "Mentor / Advisor Update",
  "Coding Demo",
  "Presentation",
  "Open Discussion",
  "Questions, Concerns & Announcements",
  "Next Steps & Action Items",
];

const DEFAULT_AGENDA_TOPICS = [
  "Check-in & Attendance",
  "Short-Term Task Updates",
  "Long-Term Goals & Milestones Update",
  "Data Review & Analysis",
  "Open Discussion",
  "Questions, Concerns & Announcements",
  "Next Steps & Action Items",
];

// ─── Helpers ──────────────────────────────────────────────────────
let _uid = 1;
const uid = () => String(_uid++);

function emptyRow()         { return { id:uid(), description:"", assigned:[], category:"", priority:"Medium", status:"Not Started", notes:"" }; }
function makeRows(n=3)      { return Array.from({length:n}, emptyRow); }
function emptyAgendaItem(text="") { return { id:uid(), text, notes:"" }; }
function emptyQuestion()    { return { id:uid(), text:"", owner:"", resolved:false }; }
function emptyActionItem()  { return { id:uid(), task:"", owner:"", due:"", done:false }; }
function emptyDecision()    { return { id:uid(), text:"" }; }

function emptyMeetingNotes() {
  return {
    time:"", location:ZOOM_LINK, attendees:[],
    agendaItems: DEFAULT_AGENDA_TOPICS.map(t=>emptyAgendaItem(t)),
    shortTaskRecap:"", longGoalRecap:"",
    questions:[emptyQuestion()], actionItems:[emptyActionItem()],
    decisions:[emptyDecision()], generalNotes:"",
  };
}

function makeInitWeeks() {
  // First tracked week should align with the rotation start
  return [{ id:uid(), date:"2026-02-22", shortRows:makeRows(3), longRows:makeRows(3), meetingNotes:emptyMeetingNotes() }];
}

function formatDate(iso) {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return new Date(+y,+m-1,+d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function nextMonday(isoStr) {
  const d = isoStr ? new Date(isoStr+"T00:00:00") : new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day===1?7:(8-day)%7||7));
  return d.toISOString().slice(0,10);
}

// ─── Shared hook ──────────────────────────────────────────────────
function useOutsideClose(cb) {
  const ref = useRef(null);
  useEffect(()=>{
    function h(e){ if(ref.current&&!ref.current.contains(e.target)) cb(); }
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);
  return ref;
}

// ─── Style helpers ────────────────────────────────────────────────
const card = (extra={}) => ({ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:10, overflow:"hidden", ...extra });
const sectionHead = (bg) => ({ background:bg, padding:"12px 18px", display:"flex", alignItems:"center", gap:10 });

// ─── Text area ────────────────────────────────────────────────────
function TA({ value, onChange, placeholder, rows=3 }) {
  return (
    <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{width:"100%",border:"1.5px solid #cbd5e1",borderRadius:7,padding:"8px 10px",fontSize:13,resize:"vertical",fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border-color 0.12s",lineHeight:1.6,color:"#374151"}}
      onFocus={e=>e.target.style.borderColor="#2E75B6"} onBlur={e=>e.target.style.borderColor="#cbd5e1"}/>
  );
}

// ─── Multi-select ─────────────────────────────────────────────────
function MultiSelect({ options, value, onChange, disabled }) {
  const [open,setOpen] = useState(false);
  const ref = useOutsideClose(()=>setOpen(false));
  function toggle(opt) {
    if(disabled) return;
    onChange(value.includes(opt)?value.filter(v=>v!==opt):[...value,opt]);
  }
  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      <div onClick={()=>!disabled&&setOpen(o=>!o)} style={{minHeight:34,padding:"3px 24px 3px 6px",border:"1.5px solid",borderColor:open?"#2E75B6":"#cbd5e1",borderRadius:6,cursor:disabled?"default":"pointer",background:disabled?"#f8fafc":"#fff",position:"relative",display:"flex",flexWrap:"wrap",gap:3,alignItems:"center",boxShadow:open?"0 0 0 3px rgba(46,117,182,0.1)":"none",transition:"all 0.12s"}}>
        {value.length===0 ? <span style={{color:"#94a3b8",fontSize:12}}>Select members…</span>
          : value.map(v=>{const mi=MEMBERS.indexOf(v);const col=MEMBER_COLORS[mi%MEMBER_COLORS.length];const name=v.split(",")[1]?.trim()+" "+v.split(",")[0]?.trim();return(<span key={v} style={{background:col.bg,color:col.text,borderRadius:4,padding:"1px 5px",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3}}>{name}{!disabled&&<span onClick={e=>{e.stopPropagation();toggle(v);}} style={{cursor:"pointer",fontWeight:900,fontSize:12}}>×</span>}</span>);})}
        {!disabled&&<span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",fontSize:9,pointerEvents:"none"}}>{open?"▲":"▼"}</span>}
      </div>
      {open&&(<div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,zIndex:9999,background:"#fff",border:"1.5px solid #cbd5e1",borderRadius:8,boxShadow:"0 8px 28px rgba(0,0,0,0.13)",overflow:"hidden"}}>
        {options.map((opt,i)=>{const sel=value.includes(opt);const col=MEMBER_COLORS[i%MEMBER_COLORS.length];const name=opt.split(",")[1]?.trim()+" "+opt.split(",")[0]?.trim();return(<div key={opt} onClick={()=>toggle(opt)} style={{padding:"8px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:9,background:sel?"#f0f7ff":"#fff"}} onMouseEnter={e=>e.currentTarget.style.background=sel?"#e6f0ff":"#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=sel?"#f0f7ff":"#fff"}><div style={{width:15,height:15,borderRadius:3,border:"1.5px solid",borderColor:sel?"#2E75B6":"#d1d5db",background:sel?"#2E75B6":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{sel&&<span style={{color:"#fff",fontSize:9,fontWeight:800}}>✓</span>}</div><span style={{background:sel?col.bg:"transparent",color:sel?col.text:"#374151",borderRadius:4,padding:sel?"1px 7px":0,fontSize:13,fontWeight:sel?600:400}}>{name}</span></div>);})}</div>)}
    </div>
  );
}

// ─── Single-select ────────────────────────────────────────────────
function SingleSelect({ options, value, onChange, colorMap, disabled, placeholder="Select…" }) {
  const [open,setOpen] = useState(false);
  const ref = useOutsideClose(()=>setOpen(false));
  const col = colorMap?.[value];
  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      <div onClick={()=>!disabled&&setOpen(o=>!o)} style={{height:34,padding:"0 24px 0 9px",border:"1.5px solid",borderColor:open?"#2E75B6":"#cbd5e1",borderRadius:6,cursor:disabled?"default":"pointer",background:col?.bg||(disabled?"#f8fafc":"#fff"),display:"flex",alignItems:"center",position:"relative",boxShadow:open?"0 0 0 3px rgba(46,117,182,0.1)":"none",transition:"all 0.12s"}}>
        <span style={{fontSize:12,fontWeight:600,color:col?.text||"#374151",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{value||<span style={{color:"#94a3b8",fontWeight:400}}>{placeholder}</span>}</span>
        {!disabled&&<span style={{position:"absolute",right:6,color:"#94a3b8",fontSize:9}}>{open?"▲":"▼"}</span>}
      </div>
      {open&&(<div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,zIndex:9999,background:"#fff",border:"1.5px solid #cbd5e1",borderRadius:8,boxShadow:"0 8px 28px rgba(0,0,0,0.13)",overflow:"hidden"}}>
        {options.map(opt=>{const c=colorMap?.[opt];const sel=value===opt;return(<div key={opt} onClick={()=>{onChange(opt);setOpen(false);}} style={{padding:"8px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,background:sel?"#f0f7ff":"#fff"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=sel?"#f0f7ff":"#fff"}>{sel&&<span style={{color:"#2E75B6",fontSize:10}}>✓</span>}<span style={{background:c?.bg||"transparent",color:c?.text||"#374151",borderRadius:4,padding:c?"2px 8px":0,fontSize:13,fontWeight:sel?600:400}}>{opt}</span></div>);})}</div>)}
    </div>
  );
}

// ─── Goal Table ───────────────────────────────────────────────────
const taStyle = {width:"100%",border:"1.5px solid #cbd5e1",borderRadius:6,padding:"5px 7px",fontSize:13,resize:"vertical",fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border-color 0.12s"};

function GoalTH({children,w}) {
  return <th style={{padding:"9px 8px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.9)",background:"rgba(0,0,0,0.18)",textAlign:"left",letterSpacing:"0.05em",textTransform:"uppercase",whiteSpace:"nowrap",width:w}}>{children}</th>;
}

function GoalRow({ row, dimmed, accentBg, onUpd, onDel }) {
  const bg = dimmed ? "#f3f4f6" : accentBg;
  return (
    <tr style={{background:bg,opacity:dimmed?0.65:1}}>
      <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle"}}>
        {dimmed
          ? <span style={{fontSize:13,color:"#6b7280",textDecoration:"line-through",display:"block",padding:"4px 0"}}>{row.description||"—"}</span>
          : <textarea value={row.description} onChange={e=>onUpd(row.id,"description",e.target.value)} placeholder="Describe the goal or task…" rows={2} style={taStyle} onFocus={e=>e.target.style.borderColor="#2E75B6"} onBlur={e=>e.target.style.borderColor="#cbd5e1"}/>
        }
      </td>
      <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",width:210}}><MultiSelect options={MEMBERS} value={row.assigned} onChange={v=>onUpd(row.id,"assigned",v)} disabled={dimmed}/></td>
      <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",width:165}}><SingleSelect options={CATEGORIES} value={row.category} onChange={v=>onUpd(row.id,"category",v)} disabled={dimmed}/></td>
      <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",width:105}}><SingleSelect options={PRIORITIES} value={row.priority} onChange={v=>onUpd(row.id,"priority",v)} colorMap={PRIORITY_COLORS} disabled={dimmed}/></td>
      <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",width:125}}><SingleSelect options={STATUSES} value={row.status} onChange={v=>onUpd(row.id,"status",v)} colorMap={STATUS_COLORS}/></td>
      <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",width:185}}>
        {dimmed
          ? <span style={{fontSize:12,color:"#9ca3af"}}>{row.notes||"—"}</span>
          : <textarea value={row.notes} onChange={e=>onUpd(row.id,"notes",e.target.value)} placeholder="Notes…" rows={2} style={taStyle} onFocus={e=>e.target.style.borderColor="#2E75B6"} onBlur={e=>e.target.style.borderColor="#cbd5e1"}/>
        }
      </td>
      <td style={{padding:"6px 4px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",width:28,textAlign:"center"}}>
        <button onClick={()=>onDel(row.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#d1d5db",fontSize:15,lineHeight:1,padding:3,borderRadius:4,transition:"color 0.12s"}} onMouseEnter={e=>e.currentTarget.style.color="#ef4444"} onMouseLeave={e=>e.currentTarget.style.color="#d1d5db"}>✕</button>
      </td>
    </tr>
  );
}

function GoalTable({ title, titleBg, accentBg, rows, setRows }) {
  function upd(id,field,val) { setRows(p=>p.map(r=>r.id===id?{...r,[field]:val}:r)); }
  function del(id) { setRows(p=>p.filter(r=>r.id!==id)); }
  function add() { setRows(p=>[...p,emptyRow()]); }
  const active=rows.filter(r=>r.status!=="Complete");
  const completed=rows.filter(r=>r.status==="Complete");
  return (
    <div style={{marginBottom:36}}>
      <div style={{background:titleBg,borderRadius:"10px 10px 0 0",padding:"12px 20px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:14,fontWeight:800,color:"#fff"}}>{title}</span>
        <span style={{background:"rgba(255,255,255,0.2)",color:"#fff",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600}}>{rows.length} tasks</span>
        {completed.length>0&&<span style={{background:"rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.8)",borderRadius:20,padding:"2px 10px",fontSize:11}}>✓ {completed.length} done</span>}
      </div>
      <div style={{overflowX:"auto",border:"1.5px solid #e2e8f0",borderTop:"none",borderRadius:"0 0 10px 10px"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
          <thead><tr style={{background:titleBg}}><GoalTH>Goal / Task Description</GoalTH><GoalTH w={210}>Assigned</GoalTH><GoalTH w={165}>Category</GoalTH><GoalTH w={105}>Priority</GoalTH><GoalTH w={125}>Status</GoalTH><GoalTH w={185}>Notes</GoalTH><GoalTH w={28}></GoalTH></tr></thead>
          <tbody>
            {active.map(row=><GoalRow key={row.id} row={row} dimmed={false} accentBg={accentBg} onUpd={upd} onDel={del}/>)}
            {active.length===0&&<tr><td colSpan={7} style={{padding:"20px",textAlign:"center",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>{completed.length>0?"All tasks complete! 🎉":"No tasks yet — add one below."}</td></tr>}
            {completed.length>0&&<><tr><td colSpan={7} style={{padding:"8px 14px",background:"#f9fafb",borderTop:"2px dashed #e5e7eb"}}><span style={{fontSize:10,fontWeight:700,color:"#9ca3af",letterSpacing:"0.07em",textTransform:"uppercase"}}>✓ Completed ({completed.length})</span></td></tr>{completed.map(row=><GoalRow key={row.id} row={row} dimmed={true} accentBg={accentBg} onUpd={upd} onDel={del}/>)}</>}
          </tbody>
        </table>
      </div>
      <button onClick={add} style={{marginTop:8,padding:"7px 16px",background:"transparent",border:`1.5px dashed ${titleBg}`,borderRadius:8,color:titleBg,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=titleBg;e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=titleBg;}}><span style={{fontSize:18,lineHeight:1}}>+</span> Add task</button>
    </div>
  );
}

// ─── Agenda list ──────────────────────────────────────────────────
function AgendaList({ items, setItems, accentColor="#2E75B6" }) {
  const safeItems = Array.isArray(items) ? items : [];
  function upd(id,field,val) { setItems(p=>{ const arr = Array.isArray(p) ? p : []; return arr.map(x=>x.id===id?{...x,[field]:val}:x); }); }
  function del(id) { setItems(p=>{ const arr = Array.isArray(p) ? p : []; return arr.filter(x=>x.id!==id); }); }
  function add()   { setItems(p=>{ const arr = Array.isArray(p) ? p : []; return [...arr, emptyAgendaItem()]; }); }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {safeItems.map((item,i)=>(
        <div key={item.id} style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{width:24,height:24,borderRadius:"50%",background:`${accentColor}18`,color:accentColor,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:5}}>{i+1}</span>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:5}}>
            <SingleSelect options={AGENDA_CATEGORIES} value={item.text} onChange={v=>upd(item.id,"text",v)} placeholder="Select agenda category…"/>
            <div style={{paddingLeft:8,borderLeft:`2px solid ${accentColor}30`}}>
              <TA value={item.notes} onChange={v=>upd(item.id,"notes",v)} placeholder="Notes for this item…" rows={2}/>
            </div>
          </div>
          <button onClick={()=>del(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#d1d5db",fontSize:15,padding:"5px 3px",transition:"color 0.12s",marginTop:4}} onMouseEnter={e=>e.currentTarget.style.color="#ef4444"} onMouseLeave={e=>e.currentTarget.style.color="#d1d5db"}>✕</button>
        </div>
      ))}
      <button onClick={add} style={{alignSelf:"flex-start",marginTop:2,padding:"5px 12px",background:"transparent",border:`1.5px dashed ${accentColor}`,borderRadius:7,color:accentColor,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=accentColor;e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=accentColor;}}><span>+</span> Add agenda item</button>
    </div>
  );
}

// ─── Bullet list ──────────────────────────────────────────────────
function BulletList({ items, setItems, placeholder, addLabel, accentColor="#2E75B6", emptyFn }) {
  function upd(id,text) { setItems(p=>p.map(x=>x.id===id?{...x,text}:x)); }
  function del(id) { setItems(p=>p.filter(x=>x.id!==id)); }
  function add()   { setItems(p=>[...p, emptyFn?emptyFn():{id:uid(),text:""}]); }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {items.map((item,i)=>(<div key={item.id} style={{display:"flex",alignItems:"flex-start",gap:8}}><span style={{width:22,height:22,borderRadius:"50%",background:`${accentColor}18`,color:accentColor,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:7}}>{i+1}</span><div style={{flex:1}}><TA value={item.text} onChange={v=>upd(item.id,v)} placeholder={placeholder} rows={1}/></div><button onClick={()=>del(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#d1d5db",fontSize:15,padding:"5px 3px",transition:"color 0.12s",marginTop:3}} onMouseEnter={e=>e.currentTarget.style.color="#ef4444"} onMouseLeave={e=>e.currentTarget.style.color="#d1d5db"}>✕</button></div>))}
      <button onClick={add} style={{alignSelf:"flex-start",marginTop:4,padding:"5px 12px",background:"transparent",border:`1.5px dashed ${accentColor}`,borderRadius:7,color:accentColor,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=accentColor;e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=accentColor;}}><span>+</span>{addLabel}</button>
    </div>
  );
}

// ─── Action items table ───────────────────────────────────────────
function ActionItemsTable({ items, setItems }) {
  function upd(id,field,val) { setItems(p=>p.map(x=>x.id===id?{...x,[field]:val}:x)); }
  function del(id) { setItems(p=>p.filter(x=>x.id!==id)); }
  function add()   { setItems(p=>[...p,emptyActionItem()]); }
  const memberNames = MEMBERS.map(m=>m.split(",")[1]?.trim()+" "+m.split(",")[0]?.trim());
  return (
    <div>
      <div style={{overflowX:"auto",borderRadius:8,border:"1.5px solid #e2e8f0"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
          <thead><tr style={{background:"#f1f5f9"}}>{["#","Action Item","Owner","Due Date","Done"].map((h,i)=>(<th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase",width:i===0?32:i===2?160:i===3?120:i===4?70:"auto"}}>{h}</th>))}<th style={{width:28}}></th></tr></thead>
          <tbody>
            {items.map((a,i)=>(<tr key={a.id} style={{background:i%2===0?"#f8fafc":"#fff",opacity:a.done?0.5:1}}>
              <td style={{padding:"6px 12px",fontSize:12,color:"#9ca3af",fontWeight:600,borderBottom:"1px solid #f1f5f9"}}>{i+1}</td>
              <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9"}}><TA value={a.task} onChange={v=>upd(a.id,"task",v)} placeholder="Describe the action item…" rows={1}/></td>
              <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",width:160}}><SingleSelect options={memberNames} value={a.owner} onChange={v=>upd(a.id,"owner",v)} placeholder="Assign…"/></td>
              <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",width:120}}><input type="date" value={a.due} onChange={e=>upd(a.id,"due",e.target.value)} style={{border:"1.5px solid #cbd5e1",borderRadius:6,padding:"5px 7px",fontSize:12,fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#2E75B6"} onBlur={e=>e.target.style.borderColor="#cbd5e1"}/></td>
              <td style={{padding:"6px 12px",borderBottom:"1px solid #f1f5f9",textAlign:"center"}}><div onClick={()=>upd(a.id,"done",!a.done)} style={{width:20,height:20,borderRadius:4,border:"1.5px solid",borderColor:a.done?"#10b981":"#d1d5db",background:a.done?"#10b981":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",margin:"0 auto",transition:"all 0.12s"}}>{a.done&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}</div></td>
              <td style={{padding:"6px 4px",borderBottom:"1px solid #f1f5f9",textAlign:"center"}}><button onClick={()=>del(a.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#d1d5db",fontSize:14,padding:3,transition:"color 0.12s"}} onMouseEnter={e=>e.currentTarget.style.color="#ef4444"} onMouseLeave={e=>e.currentTarget.style.color="#d1d5db"}>✕</button></td>
            </tr>))}
            {items.length===0&&<tr><td colSpan={6} style={{padding:"16px",textAlign:"center",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>No action items yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <button onClick={add} style={{marginTop:8,padding:"6px 14px",background:"transparent",border:"1.5px dashed #f59e0b",borderRadius:7,color:"#b45309",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#f59e0b";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#b45309";}}><span>+</span> Add action item</button>
    </div>
  );
}

// ─── Questions table ──────────────────────────────────────────────
function QuestionsTable({ items, setItems }) {
  function upd(id,field,val) { setItems(p=>p.map(x=>x.id===id?{...x,[field]:val}:x)); }
  function del(id) { setItems(p=>p.filter(x=>x.id!==id)); }
  function add()   { setItems(p=>[...p,emptyQuestion()]); }
  const memberNames = MEMBERS.map(m=>m.split(",")[1]?.trim()+" "+m.split(",")[0]?.trim());
  return (
    <div>
      <div style={{overflowX:"auto",borderRadius:8,border:"1.5px solid #e2e8f0"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
          <thead><tr style={{background:"#f1f5f9"}}>{["#","Question / Concern","Owner","Resolved"].map((h,i)=>(<th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase",width:i===0?32:i===2?160:i===3?90:"auto"}}>{h}</th>))}<th style={{width:28}}></th></tr></thead>
          <tbody>
            {items.map((q,i)=>(<tr key={q.id} style={{background:i%2===0?"#f8fafc":"#fff",opacity:q.resolved?0.55:1}}>
              <td style={{padding:"6px 12px",fontSize:12,color:"#9ca3af",fontWeight:600,borderBottom:"1px solid #f1f5f9"}}>{i+1}</td>
              <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9"}}><TA value={q.text} onChange={v=>upd(q.id,"text",v)} placeholder="Enter question or concern…" rows={1}/></td>
              <td style={{padding:"6px 8px",borderBottom:"1px solid #f1f5f9",width:160}}><SingleSelect options={memberNames} value={q.owner} onChange={v=>upd(q.id,"owner",v)} placeholder="Assign…"/></td>
              <td style={{padding:"6px 12px",borderBottom:"1px solid #f1f5f9",textAlign:"center"}}><div onClick={()=>upd(q.id,"resolved",!q.resolved)} style={{width:20,height:20,borderRadius:4,border:"1.5px solid",borderColor:q.resolved?"#10b981":"#d1d5db",background:q.resolved?"#10b981":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",margin:"0 auto",transition:"all 0.12s"}}>{q.resolved&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}</div></td>
              <td style={{padding:"6px 4px",borderBottom:"1px solid #f1f5f9",textAlign:"center"}}><button onClick={()=>del(q.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#d1d5db",fontSize:14,padding:3,transition:"color 0.12s"}} onMouseEnter={e=>e.currentTarget.style.color="#ef4444"} onMouseLeave={e=>e.currentTarget.style.color="#d1d5db"}>✕</button></td>
            </tr>))}
            {items.length===0&&<tr><td colSpan={5} style={{padding:"16px",textAlign:"center",color:"#9ca3af",fontSize:13,fontStyle:"italic"}}>No questions yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <button onClick={add} style={{marginTop:8,padding:"6px 14px",background:"transparent",border:"1.5px dashed #7030A0",borderRadius:7,color:"#7030A0",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#7030A0";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#7030A0";}}><span>+</span> Add question</button>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────
function Section({ icon, title, accentColor="#2E75B6", children, badge }) {
  return (
    <div style={card({marginBottom:20})}>
      <div style={{...sectionHead(accentColor)}}>
        <span style={{fontSize:16}}>{icon}</span>
        <span style={{fontSize:14,fontWeight:800,color:"#fff"}}>{title}</span>
        {badge&&<span style={{marginLeft:"auto",background:"rgba(255,255,255,0.2)",color:"#fff",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600}}>{badge}</span>}
      </div>
      <div style={{padding:"18px 20px"}}>{children}</div>
    </div>
  );
}

// ─── Meeting Notes tab ────────────────────────────────────────────
function MeetingNotesTab({ week, updWeek }) {
  const mn = week.meetingNotes;
  const mnRef = useRef(mn);
  mnRef.current = mn;
  const upd = useCallback((field,val) => {
    updWeek("meetingNotes",{...mnRef.current,[field]:val});
  }, [updWeek]);

  const setAgendaItems  = useCallback(v=>{
    const cur = Array.isArray(mnRef.current.agendaItems) ? mnRef.current.agendaItems : [];
    upd("agendaItems", typeof v==="function" ? v(cur) : v);
  }, [upd]);
  const setShortRecap   = useCallback(v=>upd("shortTaskRecap",v), [upd]);
  const setLongRecap    = useCallback(v=>upd("longGoalRecap",v),  [upd]);
  const setActionItems  = useCallback(v=>{
    const cur = Array.isArray(mnRef.current.actionItems) ? mnRef.current.actionItems : [];
    upd("actionItems", typeof v==="function" ? v(cur) : v);
  }, [upd]);
  const setDecisions    = useCallback(v=>{
    const cur = Array.isArray(mnRef.current.decisions) ? mnRef.current.decisions : [];
    upd("decisions", typeof v==="function" ? v(cur) : v);
  }, [upd]);
  const setQuestions    = useCallback(v=>{
    const cur = Array.isArray(mnRef.current.questions) ? mnRef.current.questions : [];
    upd("questions", typeof v==="function" ? v(cur) : v);
  }, [upd]);
  const setGeneralNotes = useCallback(v=>upd("generalNotes",v), [upd]);
  const setTime         = useCallback(v=>upd("time",v),      [upd]);
  const setLocation     = useCallback(v=>upd("location",v),  [upd]);
  const setAttendees    = useCallback(v=>upd("attendees",v), [upd]);
  const weekIdx = MEETING_DATES.findIndex(d=>{ const dt=new Date(d);dt.setHours(0,0,0,0);const wd=new Date(week.date+"T00:00:00");wd.setHours(0,0,0,0);return dt.getTime()===wd.getTime(); });
  const idx = weekIdx>=0?weekIdx%6:0;
  const leader=LEADERS_ASC[idx], notetaker=NOTETAKERS_DESC[idx];
  const shortActive=week.shortRows.filter(r=>r.status!=="Complete");
  const shortCompleted=week.shortRows.filter(r=>r.status==="Complete");
  const longCompleted=week.longRows.filter(r=>r.status==="Complete");
  const labelStyle={fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:6};
  const metaInput={border:"1.5px solid #cbd5e1",borderRadius:7,padding:"7px 10px",fontSize:13,fontFamily:"inherit",outline:"none",transition:"border-color 0.12s",width:"100%",boxSizing:"border-box"};
  return (
    <div style={{maxWidth:960,margin:"0 auto"}}>
      {/* Allow dropdown menus (attendees, etc.) to overflow above the next section */}
      <div style={card({marginBottom:20, overflow:"visible", position:"relative", zIndex:50})}>
        <div style={sectionHead("#1F3864")}><span style={{fontSize:16}}>📝</span><span style={{fontSize:15,fontWeight:800,color:"#fff"}}>Meeting Notes</span><span style={{fontSize:13,color:"rgba(255,255,255,0.6)",marginLeft:4}}>— Week of {formatDate(week.date)}</span></div>
        <div style={{padding:"18px 20px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
          <div><span style={labelStyle}>Meeting Time</span><input value={mn.time} onChange={e=>setTime(e.target.value)} placeholder="e.g. 2:00 PM EST" style={metaInput} onFocus={e=>e.target.style.borderColor="#2E75B6"} onBlur={e=>e.target.style.borderColor="#cbd5e1"}/></div>
          <div><span style={labelStyle}>Location / Link</span><div style={{display:"flex",flexDirection:"column",gap:4}}><input value={mn.location} onChange={e=>setLocation(e.target.value)} style={{...metaInput,fontSize:11,color:"#2E75B6"}} onFocus={e=>e.target.style.borderColor="#2E75B6"} onBlur={e=>e.target.style.borderColor="#cbd5e1"}/><div style={{fontSize:10,color:"#64748b",display:"flex",gap:12}}><span>ID: <strong>{ZOOM_ID}</strong></span><span>Passcode: <strong>{ZOOM_PASS}</strong></span></div></div></div>
          <div><span style={labelStyle}>Attendees</span><MultiSelect options={MEMBERS} value={mn.attendees} onChange={setAttendees}/></div>
        </div>
        <div style={{padding:"0 20px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:"#f0f7ff",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em"}}>Leader:</span><span style={{background:"#dbeafe",color:"#1e40af",borderRadius:5,padding:"3px 10px",fontSize:12,fontWeight:700}}>{leader}</span></div>
          <div style={{background:"#f5f0ff",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em"}}>Notetaker:</span><span style={{background:"#ede9fe",color:"#5b21b6",borderRadius:5,padding:"3px 10px",fontSize:12,fontWeight:700}}>{notetaker}</span></div>
        </div>
      </div>
      <Section icon="📋" title="Agenda" accentColor="#2E75B6"><AgendaList items={mn.agendaItems} setItems={setAgendaItems} accentColor="#2E75B6"/></Section>
      <Section icon="✅" title="This Week's Task Recap" accentColor="#2E75B6" badge={`${shortCompleted.length}/${week.shortRows.length} complete`}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <div><p style={{margin:"0 0 8px",fontSize:12,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em"}}>Active Tasks ({shortActive.length})</p>{shortActive.length===0?<p style={{margin:0,fontSize:13,color:"#9ca3af",fontStyle:"italic"}}>No active tasks.</p>:shortActive.map(r=>(<div key={r.id} style={{marginBottom:8,padding:"8px 10px",background:"#f8fafc",borderRadius:7,borderLeft:"3px solid #2E75B6"}}><div style={{fontSize:13,fontWeight:600,color:"#1F3864",marginBottom:3}}>{r.description||<em style={{color:"#9ca3af"}}>Untitled</em>}</div><div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>{r.assigned.map(a=>{const mi=MEMBERS.indexOf(a);const col=MEMBER_COLORS[mi%MEMBER_COLORS.length];const n=a.split(",")[1]?.trim()+" "+a.split(",")[0]?.trim();return(<span key={a} style={{background:col.bg,color:col.text,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:600}}>{n}</span>);})}{r.status&&<span style={{background:STATUS_COLORS[r.status]?.bg,color:STATUS_COLORS[r.status]?.text,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:600}}>{r.status}</span>}</div></div>))}</div>
          <div><p style={{margin:"0 0 8px",fontSize:12,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em"}}>Completed ({shortCompleted.length})</p>{shortCompleted.length===0?<p style={{margin:0,fontSize:13,color:"#9ca3af",fontStyle:"italic"}}>Nothing completed yet.</p>:shortCompleted.map(r=>(<div key={r.id} style={{marginBottom:8,padding:"8px 10px",background:"#f0fdf4",borderRadius:7,borderLeft:"3px solid #10b981",opacity:0.8}}><div style={{fontSize:13,color:"#6b7280",textDecoration:"line-through"}}>{r.description||"—"}</div><div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:3}}>{r.assigned.map(a=>{const mi=MEMBERS.indexOf(a);const col=MEMBER_COLORS[mi%MEMBER_COLORS.length];const n=a.split(",")[1]?.trim()+" "+a.split(",")[0]?.trim();return(<span key={a} style={{background:col.bg,color:col.text,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:600,opacity:0.7}}>{n}</span>);})}</div></div>))}</div>
        </div>
        <div><span style={labelStyle}>Additional notes on short-term tasks</span><TA value={mn.shortTaskRecap} onChange={setShortRecap} placeholder="Summarize progress, blockers, or key decisions…" rows={3}/></div>
      </Section>
      <Section icon="🎯" title="Long-Term Goals Status" accentColor="#1F3864" badge={`${longCompleted.length}/${week.longRows.length} complete`}>
        <div style={{marginBottom:16}}>{week.longRows.length===0?<p style={{margin:0,fontSize:13,color:"#9ca3af",fontStyle:"italic"}}>No long-term goals set.</p>:week.longRows.map(r=>(<div key={r.id} style={{marginBottom:8,padding:"10px 12px",background:r.status==="Complete"?"#f0fdf4":"#f8fafc",borderRadius:7,borderLeft:`3px solid ${r.status==="Complete"?"#10b981":r.status==="In Progress"?"#f59e0b":r.status==="On Hold"?"#ef4444":"#cbd5e1"}`,opacity:r.status==="Complete"?0.7:1}}><div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}><div><div style={{fontSize:13,fontWeight:600,color:r.status==="Complete"?"#6b7280":"#1F3864",textDecoration:r.status==="Complete"?"line-through":"none",marginBottom:4}}>{r.description||<em style={{color:"#9ca3af"}}>Untitled goal</em>}</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{r.assigned.map(a=>{const mi=MEMBERS.indexOf(a);const col=MEMBER_COLORS[mi%MEMBER_COLORS.length];const n=a.split(",")[1]?.trim()+" "+a.split(",")[0]?.trim();return(<span key={a} style={{background:col.bg,color:col.text,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:600}}>{n}</span>);})}{r.category&&<span style={{background:"#f1f5f9",color:"#64748b",borderRadius:4,padding:"1px 6px",fontSize:10}}>{r.category}</span>}</div></div><span style={{background:STATUS_COLORS[r.status]?.bg,color:STATUS_COLORS[r.status]?.text,borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{r.status}</span></div></div>))}</div>
        <div><span style={labelStyle}>Notes on milestone progress</span><TA value={mn.longGoalRecap} onChange={setLongRecap} placeholder="Highlight progress toward long-term goals, upcoming milestones, or changes in scope…" rows={3}/></div>
      </Section>
      <Section icon="⚡" title="Action Items" accentColor="#b45309"><ActionItemsTable items={mn.actionItems} setItems={setActionItems}/></Section>
      <Section icon="🔒" title="Decisions Made" accentColor="#065f46"><BulletList items={mn.decisions} setItems={setDecisions} placeholder="Describe a decision made during the meeting…" addLabel="Add decision" accentColor="#065f46" emptyFn={emptyDecision}/></Section>
      <Section icon="❓" title="Pending Questions & Concerns" accentColor="#7030A0"><QuestionsTable items={mn.questions} setItems={setQuestions}/></Section>
      <Section icon="🗒️" title="General Notes" accentColor="#374151"><TA value={mn.generalNotes} onChange={setGeneralNotes} placeholder="Any additional notes or follow-ups from the meeting…" rows={4}/></Section>
    </div>
  );
}

// ─── New Week Modal ───────────────────────────────────────────────
function NewWeekModal({ currentWeek, onConfirm, onCancel }) {
  const [date,setDate]=useState(nextMonday(currentWeek?.date));
  const [carryShort,setCarryShort]=useState(true);
  const [carryLong,setCarryLong]=useState(true);
  const [skipDone,setSkipDone]=useState(true);
  const Check=({val,set,label})=>(<label style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,cursor:"pointer"}}><div onClick={()=>set(v=>!v)} style={{width:18,height:18,borderRadius:4,border:"1.5px solid",borderColor:val?"#2E75B6":"#cbd5e1",background:val?"#2E75B6":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>{val&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}</div><span style={{fontSize:13,color:"#374151"}}>{label}</span></label>);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
      <div style={{background:"#fff",borderRadius:16,padding:32,width:440,boxShadow:"0 24px 60px rgba(0,0,0,0.22)"}}>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:800,color:"#1F3864"}}>Create New Week</h2>
        <p style={{margin:"0 0 22px",fontSize:13,color:"#64748b"}}>Saves the current week and starts a fresh tracker and meeting notes.</p>
        <label style={{display:"block",marginBottom:20}}><span style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>New Week Start Date</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"100%",border:"1.5px solid #cbd5e1",borderRadius:8,padding:"9px 12px",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#2E75B6"} onBlur={e=>e.target.style.borderColor="#cbd5e1"}/></label>
        <p style={{fontSize:12,fontWeight:700,color:"#374151",margin:"0 0 8px"}}>Carry over to new week:</p>
        <Check val={carryShort} set={setCarryShort} label="Short-Term Goals"/>
        <Check val={carryLong} set={setCarryLong} label="Long-Term Goals (Milestones)"/>
        <Check val={skipDone} set={setSkipDone} label="Skip completed tasks when copying"/>
        <div style={{display:"flex",gap:10,marginTop:24}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:8,background:"#fff",color:"#374151",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={()=>onConfirm({date,carryShort,carryLong,skipDone})} style={{flex:2,padding:"11px",border:"none",borderRadius:8,background:"#2E75B6",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Create Week →</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]                   = useState("tracker");
  const [showModal,setShowModal]       = useState(false);
  const [showWeekNav,setShowWeekNav]   = useState(false);
  const [dbStatus,setDbStatus]         = useState("loading"); // loading | ok | error
  const [saveStatus,setSaveStatus]     = useState("saved");   // saved | saving | error
  const weekNavRef = useOutsideClose(()=>setShowWeekNav(false));

  const [weeks,setWeeks]               = useState(makeInitWeeks);
  const [activeWeekId,setActiveWeekId] = useState(()=>weeks[0].id);

  const activeWeek = weeks.find(w=>w.id===activeWeekId)||weeks[weeks.length-1];
  const isLatest   = activeWeek.id===weeks[weeks.length-1].id;

  // ── Load from Supabase on mount ──
  useEffect(()=>{
    async function load() {
      try {
        const data = await loadState();
        const norm = normalizeAndMigrateState(data);
        if (norm && norm.weeks && norm.weeks.length > 0) {
          setWeeks(norm.weeks);
          setActiveWeekId(norm.activeWeekId);

          // If we migrated dates, persist immediately so all clients converge.
          if (data && data.weeks && data.weeks.length > 0 && isoDate(data.weeks[0]?.date) === "2026-02-15") {
            try { await saveState({ weeks: norm.weeks, activeWeekId: norm.activeWeekId }); } catch(e) { /* ignore */ }
          }
        } else {
          // First time — write initial state
          const initWeeks = makeInitWeeks();
          await initRow({ weeks: initWeeks, activeWeekId: initWeeks[0].id });
          setWeeks(initWeeks);
          setActiveWeekId(initWeeks[0].id);
        }
        setDbStatus("ok");
      } catch(e) {
        console.error(e);
        setDbStatus("error");
      }
    }
    load();
  }, []);

  // ── Auto-save to Supabase whenever weeks changes ──
  const saveTimer = useRef(null);
  useEffect(()=>{
    if (dbStatus !== "ok") return;
    clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async ()=>{
      try {
        await saveState({ weeks, activeWeekId });
        setSaveStatus("saved");
      } catch(e) {
        console.error(e);
        setSaveStatus("error");
      }
    }, 300);
  }, [weeks, activeWeekId, dbStatus]);

  // ── Poll for changes from other users every 15s ──
  useEffect(()=>{
    if (dbStatus !== "ok") return;
    const interval = setInterval(async ()=>{
      try {
        const data = await loadState();
        const norm = normalizeAndMigrateState(data);
        if (norm && norm.weeks) {
          setWeeks(norm.weeks);
          // Don't change activeWeekId from polling — let each user control their own view
        }
      } catch(e) { /* silent */ }
    }, 15000);
    return ()=>clearInterval(interval);
  }, [dbStatus]);

  const activeWeekIdRef = useRef(activeWeekId);
  activeWeekIdRef.current = activeWeekId;
  const updWeek = useCallback((field,val) => {
    setWeeks(p=>p.map(w=>w.id===activeWeekIdRef.current?{...w,[field]:val}:w));
  }, []);

  const setShortRows = useCallback(v=>setWeeks(p=>p.map(w=>w.id===activeWeekIdRef.current?{...w,shortRows:typeof v==="function"?v(w.shortRows):v}:w)), []);
  const setLongRows  = useCallback(v=>setWeeks(p=>p.map(w=>w.id===activeWeekIdRef.current?{...w,longRows: typeof v==="function"?v(w.longRows):v}:w)), []);

  function handleCreate({date,carryShort,carryLong,skipDone}) {
    function copy(rows) {
      return rows.filter(r=>!(skipDone&&r.status==="Complete")).map(r=>({...r,id:uid(),status:r.status==="Complete"?"Not Started":r.status}));
    }
    const nw = {
      id:uid(), date,
      shortRows: carryShort?copy(activeWeek.shortRows):makeRows(3),
      longRows:  carryLong?copy(activeWeek.longRows):makeRows(3),
      meetingNotes: {
        ...emptyMeetingNotes(),
        questions: activeWeek.meetingNotes.questions.filter(q=>!q.resolved).map(q=>({...q,id:uid()})),
      },
    };
    setWeeks(p=>[...p,nw]);
    setActiveWeekId(nw.id);
    setShowModal(false);
  }

  const TABS = [
    {id:"tracker",  label:"📋 Weekly Tracker"},
    {id:"notes",    label:"📝 Meeting Notes"},
    {id:"rotation", label:"🔄 Meeting Rotation"},
    {id:"cover",    label:"📖 Reference Guide"},
  ];

  const saveIndicator = {
    saved:  { color:"#10b981", text:"✓ Saved" },
    saving: { color:"#f59e0b", text:"⟳ Saving…" },
    error:  { color:"#ef4444", text:"⚠ Save error" },
  }[saveStatus];

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      {showModal&&<NewWeekModal currentWeek={activeWeek} onConfirm={handleCreate} onCancel={()=>setShowModal(false)}/>}

      {/* ── Header ── */}
      <div style={{background:"linear-gradient(135deg,#1F3864 0%,#2E75B6 100%)",padding:"22px 28px 0",boxShadow:"0 4px 24px rgba(31,56,100,0.25)"}}>
        <div style={{maxWidth:1400,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:18}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600}}>Health Data Science Training Program</span>
                {dbStatus==="loading" && <span style={{fontSize:10,background:"rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.7)",borderRadius:4,padding:"1px 7px"}}>Connecting…</span>}
                {dbStatus==="error"   && <span style={{fontSize:10,background:"#fee2e2",color:"#991b1b",borderRadius:4,padding:"1px 7px"}}>⚠ DB Error — running offline</span>}
                {dbStatus==="ok"      && <span style={{fontSize:10,color:saveIndicator.color,fontWeight:600}}>{saveIndicator.text}</span>}
              </div>
              <h1 style={{margin:0,fontSize:24,fontWeight:800,color:"#fff",letterSpacing:"-0.02em"}}>
                HDSTP – Group 6 Activity Tracker
                <span style={{fontSize:13,fontWeight:400,color:"rgba(255,255,255,0.45)",marginLeft:12}}>Feb 15 – Jun 29, 2026</span>
              </h1>
            </div>

            {(tab==="tracker"||tab==="notes")&&(
              <div style={{display:"flex",alignItems:"center",gap:10,paddingTop:4}}>
                <div ref={weekNavRef} style={{position:"relative"}}>
                  <button onClick={()=>setShowWeekNav(o=>!o)} style={{padding:"8px 14px",background:"rgba(255,255,255,0.12)",border:"1.5px solid rgba(255,255,255,0.22)",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    <span>📅</span><span>Week of {formatDate(activeWeek.date)}</span><span style={{fontSize:9}}>{showWeekNav?"▲":"▼"}</span>
                  </button>
                  {showWeekNav&&(
                    <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 28px rgba(0,0,0,0.14)",overflow:"hidden",zIndex:500,minWidth:230}}>
                      <div style={{padding:"8px 14px",fontSize:10,fontWeight:700,color:"#9ca3af",letterSpacing:"0.06em",textTransform:"uppercase",background:"#f9fafb",borderBottom:"1px solid #f1f5f9"}}>Saved Weeks</div>
                      {[...weeks].reverse().map(w=>(<div key={w.id} onClick={()=>{setActiveWeekId(w.id);setShowWeekNav(false);}} style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",background:w.id===activeWeekId?"#eff6ff":"#fff",borderBottom:"1px solid #f9fafb"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=w.id===activeWeekId?"#eff6ff":"#fff"}><span style={{fontSize:13,fontWeight:w.id===activeWeekId?700:400,color:w.id===activeWeekId?"#2E75B6":"#374151"}}>{formatDate(w.date)}</span>{w.id===weeks[weeks.length-1].id&&<span style={{fontSize:10,background:"#dbeafe",color:"#1e40af",borderRadius:4,padding:"1px 7px",fontWeight:600}}>Latest</span>}</div>))}
                    </div>
                  )}
                </div>
                {isLatest
                  ? <button onClick={()=>{setShowWeekNav(false);setShowModal(true);}} style={{padding:"8px 16px",background:"#fff",border:"none",borderRadius:8,color:"#1F3864",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6,boxShadow:"0 2px 8px rgba(0,0,0,0.12)",fontFamily:"inherit",whiteSpace:"nowrap"}}>＋ New Week</button>
                  : <button onClick={()=>setActiveWeekId(weeks[weeks.length-1].id)} style={{padding:"8px 14px",background:"rgba(255,255,255,0.12)",border:"1.5px solid rgba(255,255,255,0.22)",borderRadius:8,color:"rgba(255,255,255,0.8)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>← Latest</button>
                }
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:3}}>
            {TABS.map(t=>(<button key={t.id} onClick={()=>{setTab(t.id);setShowWeekNav(false);}} style={{padding:"9px 18px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,borderRadius:"8px 8px 0 0",background:tab===t.id?"#f8fafc":"rgba(255,255,255,0.1)",color:tab===t.id?"#1F3864":"rgba(255,255,255,0.7)",transition:"all 0.15s"}}>{t.label}</button>))}
          </div>
        </div>
      </div>

      {/* ── Loading screen ── */}
      {dbStatus==="loading" && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",flexDirection:"column",gap:16}}>
          <div style={{width:40,height:40,border:"3px solid #e2e8f0",borderTop:"3px solid #2E75B6",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}></div>
          <p style={{color:"#64748b",fontSize:14}}>Loading tracker data…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ── Content ── */}
      {dbStatus!=="loading" && (
        <div style={{maxWidth:1400,margin:"0 auto",padding:"28px"}}>

          {tab==="tracker"&&(
            <div>
              {!isLatest&&(<div style={{background:"#fef3c7",border:"1.5px solid #f59e0b",borderRadius:8,padding:"10px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}><span>⚠️</span><span style={{fontSize:13,color:"#92400e",fontWeight:500}}>Viewing past week ({formatDate(activeWeek.date)}).</span><button onClick={()=>setActiveWeekId(weeks[weeks.length-1].id)} style={{marginLeft:"auto",padding:"5px 12px",background:"#f59e0b",border:"none",borderRadius:6,color:"#fff",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Latest Week</button></div>)}
              <GoalTable title="SHORT-TERM GOALS — This Week's Tasks" titleBg="#2E75B6" accentBg="#fefce8" rows={activeWeek.shortRows} setRows={setShortRows}/>
              <GoalTable title="LONG-TERM GOALS — Milestones & Deliverables" titleBg="#1F3864" accentBg="#f0fdf4" rows={activeWeek.longRows} setRows={setLongRows}/>
            </div>
          )}

          {tab==="notes"&&<MeetingNotesTab week={activeWeek} updWeek={updWeek}/>}

          {tab==="rotation"&&(
            <div>
              <div style={{marginBottom:20}}><h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:800,color:"#1F3864"}}>Meeting Rotation</h2><p style={{margin:0,color:"#64748b",fontSize:14}}>Leader rotates A→Z · Notetaker rotates Z→A · Both cycle every 6 weeks · 20 meetings total</p></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
                {["Leader (A→Z)","Notetaker (Z→A)"].map((label,li)=>(<div key={label} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}><div style={{background:li===0?"#2E75B6":"#7030A0",padding:"12px 16px"}}><span style={{color:"#fff",fontWeight:700,fontSize:13}}>{label}</span></div>{(li===0?LEADERS_ASC:NOTETAKERS_DESC).map((m,i)=>(<div key={m} style={{padding:"8px 16px",fontSize:13,display:"flex",alignItems:"center",gap:10,background:i%2===0?"#f8fafc":"#fff",borderBottom:"1px solid #f1f5f9"}}><span style={{width:22,height:22,borderRadius:"50%",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",background:li===0?"#dbeafe":"#ede9fe",color:li===0?"#1e40af":"#5b21b6",flexShrink:0}}>{i+1}</span><span style={{fontWeight:500}}>{m}</span></div>))}</div>))}
              </div>
              <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:"#1F3864"}}>{["Wk","Date","Meeting Leader","Notetaker","Agenda / Link","Action Items"].map(h=>(<th key={h} style={{padding:"11px 14px",fontSize:10,fontWeight:700,color:"#fff",textAlign:"left",letterSpacing:"0.05em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>))}</tr></thead>
                  <tbody>{MEETING_DATES.map((dt,wi)=>{const idx=wi%6;const now=new Date();now.setHours(0,0,0,0);const dtc=new Date(dt);dtc.setHours(0,0,0,0);const isThis=dtc.getTime()===now.getTime();const isPast=dtc<now&&!isThis;return(<tr key={wi} style={{background:isThis?"#eff6ff":wi%2===0?"#f8fafc":"#fff",borderLeft:isThis?"3px solid #2E75B6":"3px solid transparent"}}><td style={{padding:"10px 14px",fontSize:13,fontWeight:700,color:isPast?"#9ca3af":"#1F3864",borderBottom:"1px solid #f1f5f9"}}>{wi+1}</td><td style={{padding:"10px 14px",fontSize:13,color:isPast?"#9ca3af":"#374151",borderBottom:"1px solid #f1f5f9",whiteSpace:"nowrap"}}>{dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}{isThis&&<span style={{marginLeft:8,background:"#2E75B6",color:"#fff",fontSize:10,padding:"1px 6px",borderRadius:4,fontWeight:700}}>THIS WEEK</span>}</td><td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9"}}><span style={{background:"#dbeafe",color:"#1e40af",borderRadius:5,padding:"3px 9px",fontSize:12,fontWeight:600}}>{LEADERS_ASC[idx]}</span></td><td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9"}}><span style={{background:"#ede9fe",color:"#5b21b6",borderRadius:5,padding:"3px 9px",fontSize:12,fontWeight:600}}>{NOTETAKERS_DESC[idx]}</span></td><td style={{padding:"10px 14px",fontSize:13,color:"#9ca3af",borderBottom:"1px solid #f1f5f9"}}>—</td><td style={{padding:"10px 14px",fontSize:13,color:"#9ca3af",borderBottom:"1px solid #f1f5f9"}}>—</td></tr>);})}</tbody>
                </table>
              </div>
            </div>
          )}

          {tab==="cover"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
              <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}><div style={{background:"#2E75B6",padding:"14px 20px"}}><span style={{color:"#fff",fontWeight:800,fontSize:15}}>Team Members</span></div>{MEMBERS.map((m,i)=>{const col=MEMBER_COLORS[i%MEMBER_COLORS.length];const first=m.split(",")[1]?.trim(),last=m.split(",")[0]?.trim();return(<div key={m} style={{padding:"12px 20px",display:"flex",alignItems:"center",gap:12,background:i%2===0?"#f8fafc":"#fff",borderBottom:"1px solid #f1f5f9"}}><div style={{width:36,height:36,borderRadius:"50%",background:col.bg,color:col.text,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>{first?.[0]}{last?.[0]}</div><span style={{fontWeight:600,fontSize:14,color:"#1F3864"}}>{first} {last}</span></div>);})}</div>
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}><div style={{background:"#1F3864",padding:"14px 20px"}}><span style={{color:"#fff",fontWeight:800,fontSize:15}}>Status Guide</span></div>{STATUSES.map((s,i)=>{const c=STATUS_COLORS[s];return(<div key={s} style={{padding:"10px 20px",display:"flex",alignItems:"center",borderBottom:"1px solid #f1f5f9",background:i%2===0?"#f8fafc":"#fff"}}><span style={{background:c.bg,color:c.text,borderRadius:5,padding:"3px 12px",fontSize:13,fontWeight:700}}>{s}</span></div>);})}</div>
                <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}><div style={{background:"#1F3864",padding:"14px 20px"}}><span style={{color:"#fff",fontWeight:800,fontSize:15}}>Priority Guide</span></div>{PRIORITIES.map((p,i)=>{const c=PRIORITY_COLORS[p];return(<div key={p} style={{padding:"10px 20px",display:"flex",alignItems:"center",borderBottom:"1px solid #f1f5f9",background:i%2===0?"#f8fafc":"#fff"}}><span style={{background:c.bg,color:c.text,borderRadius:5,padding:"3px 12px",fontSize:13,fontWeight:700}}>{p}</span></div>);})}</div>
              </div>
              <div style={{gridColumn:"1 / -1",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                <div style={{background:"#0f766e",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{color:"#fff",fontWeight:800,fontSize:15}}>📁 Shared Resources</span>
                </div>
                <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:44,height:44,borderRadius:10,background:"#e6f4ea",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>📂</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:"#1F3864",marginBottom:3}}>Group 6 Google Drive</div>
                    <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>Shared folder for uploads, documents, and resources</div>
                    <a href="https://drive.google.com/drive/folders/18dckwmhR_1hFmdJpBiRGep7Ycqgb75_C?usp=sharing" target="_blank" rel="noopener noreferrer"
                      style={{display:"inline-flex",alignItems:"center",gap:6,background:"#0f766e",color:"#fff",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:600,textDecoration:"none"}}>
                      Open Drive →
                    </a>
                  </div>
                </div>
              </div>

              <div style={{gridColumn:"1 / -1",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}><div style={{background:"#2E75B6",padding:"14px 20px"}}><span style={{color:"#fff",fontWeight:800,fontSize:15}}>CRediT Contribution Categories</span></div><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{background:"#f1f5f9"}}><th style={{padding:"10px 16px",textAlign:"left",fontSize:10,fontWeight:700,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase",width:220}}>Category</th><th style={{padding:"10px 16px",textAlign:"left",fontSize:10,fontWeight:700,color:"#64748b",letterSpacing:"0.06em",textTransform:"uppercase"}}>Definition</th></tr></thead><tbody>{CATEGORIES.map((cat,i)=>(<tr key={cat} style={{background:i%2===0?"#f8fafc":"#fff"}}><td style={{padding:"12px 16px",fontSize:13,fontWeight:700,color:"#1F3864",borderBottom:"1px solid #f1f5f9",verticalAlign:"top"}}>{cat}</td><td style={{padding:"12px 16px",fontSize:13,color:"#475569",borderBottom:"1px solid #f1f5f9",lineHeight:1.6}}>{CAT_DESC[cat]}</td></tr>))}</tbody></table></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
