import { useState, useCallback, useEffect, useRef } from "react";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function gid() { return Math.random().toString(36).substr(2, 9); }
function toIn(ft, inch, sixteen) { return (parseInt(ft)||0)*12 + (parseInt(inch)||0) + (parseInt(sixteen)||0)/16; }
function parseIn(total) {
  const t = Math.max(0, total||0);
  return { ft: Math.floor(t/12), inch: Math.floor(t%12), sixteen: Math.round((t%1)*16) };
}
function fmt(totalInches) {
  if (!totalInches && totalInches !== 0) return "—";
  const { ft, inch, sixteen } = parseIn(totalInches);
  let s = ft > 0 ? `${ft}′ ` : "";
  s += `${inch}`;
  if (sixteen > 0) s += ` ${sixteen}/16`;
  return s.trim() + "″";
}
function fmtFt(inches) { return (inches/12).toFixed(2) + " ft"; }
function today() { return new Date().toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}); }

/* ─── geometry ────────────────────────────────────────────────────────────── */
function calcOpeningCuts(opening) {
  const { type, sides, openW, openH, reveal, trimW, qty } = opening;
  if (!openW || !openH || !trimW) return [];
  const headLen = openW + 2*reveal + 2*trimW;
  const legLen  = type === "window"
    ? openH + 2*reveal + 2*trimW
    : openH + reveal + trimW;
  const pieces = [];
  for (let i = 0; i < qty; i++) {
    const tag  = qty > 1 ? ` #${i+1}` : "";
    const base = `${opening.label || opening.type}${tag}`;
    const room = opening.room || "";
    const mk = (piece, length, side) => {
      const pieceLabel = side ? `${piece} (${side})` : piece;
      // stable ID: hash of opening.id + qty index + piece label
      const stableId = `${opening.id}_${i}_${pieceLabel}`.replace(/\s/g,"_");
      return {
        id: stableId, room, opening: base,
        piece: pieceLabel,
        label: `${room ? "["+room+"] " : ""}${base} — ${piece}${side ? " ("+side+")" : ""}`,
        length
      };
    };
    if (type === "door" && sides === "one") {
      pieces.push(mk("Head",    headLen, "Side A"));
      pieces.push(mk("Leg (L)", legLen,  "Side A"));
      pieces.push(mk("Leg (R)", legLen,  "Side A"));
    } else if (type === "door") {
      pieces.push(mk("Head",    headLen, "Side A"));
      pieces.push(mk("Leg (L)", legLen,  "Side A"));
      pieces.push(mk("Leg (R)", legLen,  "Side A"));
      pieces.push(mk("Head",    headLen, "Side B"));
      pieces.push(mk("Leg (L)", legLen,  "Side B"));
      pieces.push(mk("Leg (R)", legLen,  "Side B"));
    } else {
      pieces.push(mk("Head",    headLen, null));
      pieces.push(mk("Leg (L)", legLen,  null));
      pieces.push(mk("Leg (R)", legLen,  null));
      pieces.push(mk("Sill",    headLen, null));
    }
  }
  return pieces;
}

/* ─── optimizer ───────────────────────────────────────────────────────────── */
function optimize(pieces, stockFt, blade, wastePct) {
  const stockIn = stockFt * 12;
  const factor  = 1 + wastePct/100;
  const sorted  = [...pieces].sort((a,b) => b.length - a.length);
  const boards  = [];
  for (const piece of sorted) {
    const needed = piece.length * factor;
    let placed = false;
    for (const board of boards) {
      const gap = board.cuts.length > 0 ? blade : 0;
      if (board.remaining >= needed + gap) {
        board.remaining -= needed + gap;
        board.cuts.push(piece);
        placed = true;
        break;
      }
    }
    if (!placed) boards.push({ id: gid(), cuts: [piece], remaining: stockIn - needed });
  }
  return boards;
}

/* ─── MeasInput ───────────────────────────────────────────────────────────── */
function MeasInput({ label, value, onChange }) {
  const p = parseIn(value || 0);
  const [ft,      setFt]      = useState(p.ft);
  const [inch,    setInch]    = useState(p.inch);
  const [six,     setSix]     = useState(p.sixteen);
  const [mode,    setMode]    = useState("ftin");
  const [inOnly,  setInOnly]  = useState("");
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    const np = parseIn(value || 0);
    setFt(np.ft); setInch(np.inch); setSix(np.sixteen);
    if (mode === "in") setInOnly(value ? +value.toFixed(4) : "");
  }, [value]);

  const commit = (f,i,s) => onChange(toIn(f,i,s));
  const commitIn = (v) => onChange(parseFloat(v)||0);

  const iStyle = { padding:"5px 6px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:13, textAlign:"center", outline:"none" };
  const mBtn = (m,lbl) => (
    <button onClick={()=>{ setMode(m); if(m==="in") setInOnly(value?+value.toFixed(4):""); else { const np=parseIn(value||0); setFt(np.ft); setInch(np.inch); setSix(np.sixteen); }}} style={{ padding:"2px 6px", borderRadius:3, border:"none", cursor:"pointer", background: mode===m?"#1e3a4a":"transparent", color: mode===m?"#9adde8":"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:9 }}>{lbl}</button>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        {label ? <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>{label}</span> : <span/>}
        <div style={{ display:"flex", gap:1 }}>{mBtn("ftin","ft-in")}{mBtn("in","in only")}</div>
      </div>
      <div onFocus={()=>focused.current=true} onBlur={()=>focused.current=false}>
        {mode==="ftin" ? (
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <input type="number" min={0} max={99} value={ft||""} placeholder="0" onChange={e=>{setFt(e.target.value);commit(e.target.value,inch,six);}} style={{...iStyle,width:42}}/>
            <span style={{color:"#2a5a6a",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>′</span>
            <input type="number" min={0} max={11} value={inch||""} placeholder="0" onChange={e=>{setInch(e.target.value);commit(ft,e.target.value,six);}} style={{...iStyle,width:38}}/>
            <span style={{color:"#2a5a6a",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>″</span>
            <input type="number" min={0} max={15} value={six||""} placeholder="0" onChange={e=>{setSix(e.target.value);commit(ft,inch,e.target.value);}} style={{...iStyle,width:32}}/>
            <span style={{color:"#2a5a6a",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>/16</span>
          </div>
        ) : (
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <input type="number" min={0} step={0.0625} value={inOnly} placeholder="0" onChange={e=>{setInOnly(e.target.value);commitIn(e.target.value);}} style={{...iStyle,width:80}}/>
            <span style={{color:"#2a5a6a",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>″</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── QtyInput ────────────────────────────────────────────────────────────── */
function QtyInput({ value, onChange, color }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && document.activeElement!==ref.current) ref.current.value = value===1?"":String(value); }, [value]);
  return (
    <input ref={ref} type="number" min={1} max={20} defaultValue="" placeholder="1"
      onChange={e=>{ const v=parseInt(e.target.value); onChange(isNaN(v)?1:Math.min(20,Math.max(1,v))); }}
      onBlur={e=>{ if(!e.target.value||parseInt(e.target.value)<1){onChange(1);e.target.value="";} }}
      style={{ width:56, padding:"6px 8px", background:"#0f1923", border:`1px solid ${color}55`, borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:600, textAlign:"center", outline:"none" }}
    />
  );
}

/* ─── OpeningCard ─────────────────────────────────────────────────────────── */
const OPENING_DEFAULTS = { type:"door", sides:"both", openW:0, openH:0, reveal:0.25, trimW:2.5, blade:0.125, qty:1, label:"", room:"" };

function OpeningCard({ opening, onChange, onDelete, globalReveal, globalTrimW, globalBlade }) {
  const [expanded, setExpanded]   = useState(true);
  const [useGlobal, setUseGlobal] = useState({ reveal:true, trimW:true, blade:true });
  const eff = {
    reveal: useGlobal.reveal ? globalReveal : opening.reveal,
    trimW:  useGlobal.trimW  ? globalTrimW  : opening.trimW,
    blade:  useGlobal.blade  ? globalBlade  : opening.blade,
  };
  const cuts      = calcOpeningCuts({ ...opening, ...eff });
  const typeColor = opening.type==="door" ? "#3ab5c8" : "#7ec894";

  return (
    <div style={{ background:"#0a1520", border:"1px solid #1a3040", borderRadius:10, overflow:"hidden" }}>
      <div onClick={()=>setExpanded(e=>!e)} style={{ padding:"11px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", borderBottom: expanded?"1px solid #1a3040":"none" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", padding:"2px 7px", border:`1px solid ${typeColor}55`, borderRadius:3, color:typeColor, textTransform:"uppercase", letterSpacing:"0.1em" }}>
            {opening.type}{opening.type==="door"?` · ${opening.sides==="one"?"1 side":"2 sides"}`:""}
          </span>
          {opening.room && <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#c8a83a", background:"#c8a83a18", padding:"2px 6px", borderRadius:3 }}>{opening.room}</span>}
          <input value={opening.label} onClick={e=>e.stopPropagation()} onChange={e=>onChange({...opening,label:e.target.value})}
            placeholder={opening.type==="door"?"Front Door":"Kitchen Window"}
            style={{ background:"transparent", border:"none", color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:600, outline:"none", width:150 }}/>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#2a5a6a" }}>{cuts.length} pcs</span>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#2a5a6a" }}>{opening.openW?fmt(opening.openW):"—"} × {opening.openH?fmt(opening.openH):"—"}</span>
          <button onClick={e=>{e.stopPropagation();onDelete();}} style={{ background:"none", border:"none", color:"#2a5a6a", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
          <span style={{ color:"#2a5a6a", fontSize:12 }}>{expanded?"▲":"▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding:"14px", display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"flex-end" }}>
            {["door","window"].map(t=>(
              <button key={t} onClick={()=>onChange({...opening,type:t})} style={{ padding:"5px 14px", borderRadius:5, border:`1px solid ${opening.type===t?typeColor:"#1a3040"}`, background:opening.type===t?`${typeColor}18`:"transparent", color:opening.type===t?typeColor:"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer", textTransform:"capitalize" }}>{t}</button>
            ))}
            {opening.type==="door" && (
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>Sides</span>
                <div style={{ display:"flex", gap:4 }}>
                  {[["both","Both"],["one","One"]].map(([val,lbl])=>(
                    <button key={val} onClick={()=>onChange({...opening,sides:val})} style={{ padding:"5px 12px", borderRadius:5, border:`1px solid ${opening.sides===val?typeColor:"#1a3040"}`, background:opening.sides===val?`${typeColor}18`:"transparent", color:opening.sides===val?typeColor:"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>{lbl}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>Room</span>
              <input value={opening.room} onChange={e=>onChange({...opening,room:e.target.value})} placeholder="e.g. Master Bath"
                style={{ padding:"5px 8px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:13, outline:"none", width:130 }}/>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>Quantity</span>
              <QtyInput value={opening.qty} onChange={v=>onChange({...opening,qty:v})} color={typeColor}/>
            </div>
          </div>

          <div style={{ display:"flex", flexWrap:"wrap", gap:16 }}>
            <MeasInput label="Opening Width"  value={opening.openW} onChange={v=>onChange({...opening,openW:v})}/>
            <MeasInput label="Opening Height" value={opening.openH} onChange={v=>onChange({...opening,openH:v})}/>
          </div>

          <div style={{ background:"#060e18", border:"1px solid #152535", borderRadius:8, padding:"10px 12px", display:"flex", flexDirection:"column", gap:10 }}>
            <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>Per-Opening Overrides</span>
            <div style={{ display:"flex", flexWrap:"wrap", gap:16 }}>
              {[{key:"reveal",label:"Reveal",gval:globalReveal},{key:"trimW",label:"Trim Width",gval:globalTrimW},{key:"blade",label:"Blade Kerf",gval:globalBlade}].map(({key,label,gval})=>(
                <div key={key} style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  <label style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer" }}>
                    <input type="checkbox" checked={!useGlobal[key]} onChange={e=>setUseGlobal(g=>({...g,[key]:!e.target.checked}))} style={{ accentColor:typeColor }}/>
                    <span style={{ fontSize:10, color:useGlobal[key]?"#2a5a6a":"#9adde8", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</span>
                  </label>
                  {useGlobal[key]
                    ? <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#2a6a7a" }}>{fmt(gval)}</span>
                    : <MeasInput label="" value={opening[key]} onChange={v=>onChange({...opening,[key]:v})}/>}
                </div>
              ))}
            </div>
          </div>

          {cuts.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontSize:10, color:"#2a6a7a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>Derived Cuts</span>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {cuts.map(c=>(
                  <div key={c.id} style={{ padding:"4px 10px", background:"#0f1923", border:"1px solid #1a3a4a", borderRadius:5 }}>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#9adde8", fontWeight:600 }}>{fmt(c.length)}</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#2a6070" }}>{c.piece}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── BoardStrip ──────────────────────────────────────────────────────────── */
function BoardStrip({ board, stockFt, checked, onToggle }) {
  const stockIn  = stockFt * 12;
  const usedPct  = Math.min(100, Math.round(((stockIn - board.remaining) / stockIn) * 100));
  const color    = "#3ab5c8";
  const allDone  = board.cuts.every(c => checked[c.id]);
  const someDone = board.cuts.some(c => checked[c.id]);

  return (
    <div style={{ background:"#060e18", border:`1px solid ${allDone?"#2a6040":"#152535"}`, borderRadius:8, padding:"10px 12px", display:"flex", flexDirection:"column", gap:8, transition:"border-color 0.2s" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#3a8090", textTransform:"uppercase", letterSpacing:"0.06em" }}>{stockFt}′ board</span>
          {allDone && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#7ec894", background:"#7ec89418", border:"1px solid #7ec89444", borderRadius:3, padding:"1px 6px" }}>✓ Complete</span>}
          {someDone && !allDone && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#c8a83a", background:"#c8a83a18", border:"1px solid #c8a83a44", borderRadius:3, padding:"1px 6px" }}>In Progress</span>}
        </div>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:usedPct>85?"#7ec894":usedPct>60?"#c8a83a":"#4a8090" }}>{usedPct}% used · {fmt(board.remaining)} left</span>
      </div>
      <div style={{ height:8, background:"#0f1923", borderRadius:4, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${usedPct}%`, background:`linear-gradient(90deg,${color}99,${color})`, borderRadius:4 }}/>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {board.cuts.map(c => {
          const done = !!checked[c.id];
          return (
            <div key={c.id}
              onClick={() => onToggle(c.id)}
              style={{ padding:"8px 10px", background: done?"#0a2018":"#0a1520", border:`1px solid ${done?"#3a7050":"#1a3a4a"}`, borderRadius:6, cursor:"pointer", display:"flex", flexDirection:"column", gap:3, transition:"all 0.15s", minWidth:70, position:"relative" }}>
              {/* checkbox */}
              <div style={{ position:"absolute", top:6, right:6, width:20, height:20, borderRadius:4, border:`2px solid ${done?"#7ec894":"#2a5a6a"}`, background: done?"#7ec894":"transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s", flexShrink:0 }}>
                {done && (
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <polyline points="1.5,5 4.5,8.5 10.5,1.5" stroke="#060e18" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color: done?"#7ec894":"#e8f4f8", fontWeight:700, paddingRight:20, textDecoration: done?"line-through":"none" }}>{fmt(c.length)}</div>
              {c.room && <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color: done?"#3a7050":"#c8a83a" }}>{c.room}</div>}
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color: done?"#2a5040":"#2a6070" }}>{c.opening} — {c.piece}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Print styles + Print View ──────────────────────────────────────────── */
const PRINT_STYLES = `
  @media print {
    body { background: white !important; color: black !important; }
    .no-print { display: none !important; }
    .print-only { display: block !important; }
    .print-page { background: white !important; color: #111 !important; padding: 32px !important; }
    .print-table-row { border-bottom: 1px solid #ddd !important; }
  }
  .print-only { display: none; }
`;

function PrintView({ jobName, openings, boards, allCuts, stockFt, globalReveal, globalTrimW, globalBlade, wastePct }) {
  const totalLF = boards.length * stockFt;
  const usedLF  = allCuts.reduce((s,c)=>s+c.length,0)/12;
  return (
    <div className="print-only print-page" style={{ fontFamily:"'JetBrains Mono',monospace" }}>
      {/* header */}
      <div style={{ borderBottom:"2px solid #111", paddingBottom:12, marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:700, letterSpacing:"0.05em" }}>TRIM CUT LIST</div>
        <div style={{ fontSize:16, marginTop:4 }}>{jobName || "Untitled Job"}</div>
        <div style={{ fontSize:11, color:"#555", marginTop:4 }}>Generated: {today()} · Stock: {stockFt}′ · Reveal: {fmt(globalReveal)} · Trim Width: {fmt(globalTrimW)} · Blade: {fmt(globalBlade)} · Waste: {wastePct}%</div>
      </div>
      {/* summary */}
      <div style={{ display:"flex", gap:24, marginBottom:20, fontSize:12 }}>
        {[["Openings",openings.length],["Total Pieces",allCuts.length],["Boards Needed",boards.length],["Stock LF",`${totalLF}′`],["Used LF",`${usedLF.toFixed(1)}′`]].map(([l,v])=>(
          <div key={l}><div style={{ fontSize:9, textTransform:"uppercase", color:"#888", letterSpacing:"0.1em" }}>{l}</div><div style={{ fontSize:18, fontWeight:700 }}>{v}</div></div>
        ))}
      </div>
      {/* full cut list */}
      <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6, borderBottom:"1px solid #111", paddingBottom:4 }}>Full Cut List</div>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, marginBottom:24 }}>
        <thead>
          <tr style={{ background:"#f5f5f5" }}>
            {["#","Room","Opening","Piece","Cut Length","Lin Ft"].map(h=>(
              <th key={h} style={{ padding:"5px 8px", textAlign:"left", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"#555" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allCuts.map((c,i)=>(
            <tr key={c.id} className="print-table-row" style={{ background: i%2===0?"white":"#fafafa" }}>
              <td style={{ padding:"5px 8px", color:"#999", fontSize:10 }}>{i+1}</td>
              <td style={{ padding:"5px 8px" }}>{c.room||"—"}</td>
              <td style={{ padding:"5px 8px" }}>{c.opening}</td>
              <td style={{ padding:"5px 8px", color:"#555" }}>{c.piece}</td>
              <td style={{ padding:"5px 8px", fontWeight:700 }}>{fmt(c.length)}</td>
              <td style={{ padding:"5px 8px", color:"#888" }}>{fmtFt(c.length)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* board layout */}
      <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6, borderBottom:"1px solid #111", paddingBottom:4 }}>Board Layout</div>
      {boards.map((b,bi)=>{
        const stockIn=stockFt*12;
        const usedPct=Math.min(100,Math.round(((stockIn-b.remaining)/stockIn)*100));
        return (
          <div key={b.id} style={{ marginBottom:12, padding:"8px", border:"1px solid #ddd", borderRadius:4 }}>
            <div style={{ fontSize:11, marginBottom:4, fontWeight:600 }}>Board {bi+1} — {stockFt}′ · {usedPct}% used · {fmt(b.remaining)} remaining</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {b.cuts.map(c=>(
                <div key={c.id} style={{ padding:"3px 8px", background:"#f0f8ff", border:"1px solid #acd", borderRadius:3, fontSize:11 }}>
                  <span style={{ fontWeight:700 }}>{fmt(c.length)}</span>
                  <span style={{ color:"#555", marginLeft:4 }}>{c.room?`[${c.room}] `:" "}{c.opening} — {c.piece}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── App ─────────────────────────────────────────────────────────────────── */
const STOCK_OPTIONS = [8, 10, 12, 14, 16, 20];
const SAVE_KEY = "trimOptimizer_v1";

export default function TrimCalculator() {
  const [jobName,      setJobName]    = useState("");
  const [openings,     setOpenings]   = useState([{ ...OPENING_DEFAULTS, id:gid(), label:"Opening 1", type:"door" }]);
  const [stockFt,      setStockFt]    = useState(16);
  const [wastePct,     setWastePct]   = useState(10);
  const [globalReveal, setGReveal]    = useState(0.25);
  const [globalTrimW,  setGTrimW]     = useState(2.5);
  const [globalBlade,  setGBlade]     = useState(0.125);
  const [tab,          setTab]        = useState("input");
  const [saveMsg,      setSaveMsg]    = useState("");
  const [checked,      setChecked]    = useState({});  // cut id -> bool

  const toggleCut = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  const totalCuts = boards => boards.reduce((s,b)=>s+b.cuts.length,0);

  // load saved state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.jobName   !== undefined) setJobName(s.jobName);
        if (s.openings  !== undefined) setOpenings(s.openings);
        if (s.stockFt   !== undefined) setStockFt(s.stockFt);
        if (s.wastePct  !== undefined) setWastePct(s.wastePct);
        if (s.globalReveal !== undefined) setGReveal(s.globalReveal);
        if (s.globalTrimW  !== undefined) setGTrimW(s.globalTrimW);
        if (s.globalBlade  !== undefined) setGBlade(s.globalBlade);
      }
    } catch(e) {}
  }, []);

  const saveJob = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ jobName, openings, stockFt, wastePct, globalReveal, globalTrimW, globalBlade }));
      setSaveMsg("Saved ✓");
      setTimeout(()=>setSaveMsg(""),2000);
    } catch(e) { setSaveMsg("Save failed"); }
  };

  const newJob = () => {
    if (!window.confirm("Start a new job? Unsaved changes will be lost.")) return;
    setJobName(""); setOpenings([{ ...OPENING_DEFAULTS, id:gid(), label:"Opening 1", type:"door" }]);
    setStockFt(16); setWastePct(10); setGReveal(0.25); setGTrimW(2.5); setGBlade(0.125); setTab("input");
    localStorage.removeItem(SAVE_KEY);
  };

  const updateOpening = useCallback((u)=>setOpenings(prev=>prev.map(o=>o.id===u.id?u:o)),[]);
  const addOpening    = (type) => {
    const n = openings.length+1;
    setOpenings(prev=>[...prev,{...OPENING_DEFAULTS,id:gid(),type,label:`${type==="door"?"Door":"Window"} ${n}`}]);
  };

  const allCuts = openings.flatMap(o=>calcOpeningCuts({...o,reveal:globalReveal,trimW:globalTrimW,blade:globalBlade}));
  const boards  = optimize(allCuts, stockFt, globalBlade, wastePct);
  const totalLF = boards.length * stockFt;
  const usedLF  = allCuts.reduce((s,c)=>s+c.length,0)/12;

  const pill = (label, active, onClick, color="#3ab5c8") => (
    <button onClick={onClick} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${active?color:"#1a3040"}`, background:active?`${color}18`:"transparent", color:active?color:"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>{label}</button>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#070f18", color:"#e8f4f8" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
        ::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:#060e18;}::-webkit-scrollbar-thumb{background:#1a3040;border-radius:3px;}
        ${PRINT_STYLES}
      `}</style>

      {/* Print view — hidden on screen, visible when printing */}
      <PrintView jobName={jobName} openings={openings} boards={boards} allCuts={allCuts}
        stockFt={stockFt} globalReveal={globalReveal} globalTrimW={globalTrimW}
        globalBlade={globalBlade} wastePct={wastePct} />

      {/* ── Header ── */}
      <div className="no-print" style={{ background:"#060e18", borderBottom:"1px solid #122030", padding:"0 20px" }}>
        <div style={{ maxWidth:960, margin:"0 auto", display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", padding:"10px 0" }}>
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginRight:8 }}>
            <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:"0.08em", color:"#3ab5c8", whiteSpace:"nowrap" }}>TRIM OPTIMIZER</h1>
          </div>
          {/* Job name */}
          <input value={jobName} onChange={e=>setJobName(e.target.value)} placeholder="Job name…"
            style={{ flex:1, minWidth:160, maxWidth:300, padding:"7px 12px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:7, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:600, outline:"none" }}/>
          {/* Actions */}
          <div style={{ display:"flex", gap:6, marginLeft:"auto", flexWrap:"wrap" }}>
            {pill("⬡  Openings",  tab==="input",   ()=>setTab("input"))}
            {pill(`⬢  Cut List (${boards.length})`, tab==="results", ()=>setTab("results"), "#7ec894")}
            <button onClick={saveJob} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #1a5040", background:"#0a2a20", color:"#4ec894", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>
              {saveMsg || "💾 Save"}
            </button>
            <button onClick={()=>window.print()} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #1a3a5a", background:"#0a1a2a", color:"#6ab4d8", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>
              🖨 Print / PDF
            </button>
            <button onClick={newJob} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #2a2030", background:"transparent", color:"#4a3a5a", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>
              ＋ New Job
            </button>
          </div>
        </div>
      </div>

      <div className="no-print" style={{ maxWidth:960, margin:"0 auto", padding:"20px" }}>

        {/* Global Defaults */}
        <div style={{ background:"#0a1520", border:"1px solid #1a3040", borderRadius:10, padding:"14px 18px", marginBottom:20 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:20, alignItems:"flex-start" }}>
            <div>
              <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:8 }}>Global Defaults</span>
              <div style={{ display:"flex", flexWrap:"wrap", gap:14 }}>
                <MeasInput label="Reveal"     value={globalReveal} onChange={setGReveal}/>
                <MeasInput label="Trim Width" value={globalTrimW}  onChange={setGTrimW}/>
                <MeasInput label="Blade Kerf" value={globalBlade}  onChange={setGBlade}/>
              </div>
            </div>
            <div>
              <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:8 }}>Stock Length</span>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {STOCK_OPTIONS.map(l=>pill(`${l}′`,stockFt===l,()=>setStockFt(l)))}
              </div>
            </div>
            <div>
              <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:8 }}>Waste Factor</span>
              <div style={{ display:"flex", gap:5 }}>
                {[5,10,15,20].map(p=>pill(`${p}%`,wastePct===p,()=>setWastePct(p),"#c8a83a"))}
              </div>
            </div>
          </div>
        </div>

        {/* Openings Tab */}
        {tab==="input" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {openings.map(o=>(
              <OpeningCard key={o.id} opening={o} onChange={updateOpening}
                onDelete={()=>setOpenings(prev=>prev.filter(x=>x.id!==o.id))}
                globalReveal={globalReveal} globalTrimW={globalTrimW} globalBlade={globalBlade}/>
            ))}
            <div style={{ display:"flex", gap:10 }}>
              {["door","window"].map(t=>(
                <button key={t} onClick={()=>addOpening(t)} style={{ flex:1, padding:"12px", background:"transparent", border:"1px dashed #1a3040", borderRadius:10, color:"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:13, cursor:"pointer", transition:"all 0.2s" }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=t==="door"?"#3ab5c8":"#7ec894";e.currentTarget.style.color=t==="door"?"#3ab5c8":"#7ec894";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#1a3040";e.currentTarget.style.color="#2a6070";}}>
                  + Add {t}
                </button>
              ))}
            </div>
            {allCuts.length>0 && (
              <button onClick={()=>setTab("results")} style={{ padding:"13px", background:"#3ab5c8", border:"none", borderRadius:10, color:"#06101a", fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:"0.08em", textTransform:"uppercase" }}>
                Generate Cut List → {boards.length} boards · {totalLF} lin ft
              </button>
            )}
          </div>
        )}

        {/* Results Tab */}
        {tab==="results" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {jobName && <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:"#c8a83a", letterSpacing:"0.08em" }}>{jobName}</div>}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10 }}>
              {[{label:"Openings",val:openings.length,color:"#3ab5c8"},{label:"Total Pieces",val:allCuts.length,color:"#9adde8"},{label:"Boards",val:boards.length,color:"#7ec894"},{label:"Stock LF",val:`${totalLF}′`,color:"#c8a83a"},{label:"Used LF",val:`${usedLF.toFixed(1)}′`,color:"#d47a3a"},{label:"Waste",val:`${wastePct}%`,color:"#8a8aaa"}].map(({label,val,color})=>(
                <div key={label} style={{ background:"#0a1520", border:"1px solid #1a3040", borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#2a6070", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>{label}</div>
                  <div style={{ fontSize:26, color, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:"0.05em" }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>Optimized Board Layout — {stockFt}′ stock · {fmt(globalBlade)} kerf</span>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#3a8090", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  {Object.values(checked).filter(Boolean).length} of {allCuts.length} cuts complete
                </span>
                <button onClick={()=>setChecked({})} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#3a5060", background:"transparent", border:"none", cursor:"pointer", textDecoration:"underline" }}>Reset all</button>
              </div>
              {boards.map(b=><BoardStrip key={b.id} board={b} stockFt={stockFt} checked={checked} onToggle={toggleCut}/>)}
            </div>

            <div>
              <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:8 }}>Full Cut List</span>
              <div style={{ background:"#0a1520", border:"1px solid #1a3040", borderRadius:10, overflow:"hidden" }}>
                <div style={{ display:"grid", gridTemplateColumns:"110px 1fr 90px 110px 90px", padding:"8px 14px", borderBottom:"1px solid #122030", background:"#060e18" }}>
                  {["Room","Opening / Piece","Type","Cut Length","Lin Ft"].map(h=>(
                    <span key={h} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#2a6070", textTransform:"uppercase", letterSpacing:"0.08em" }}>{h}</span>
                  ))}
                </div>
                {allCuts.map((c,i)=>(
                  <div key={c.id} style={{ display:"grid", gridTemplateColumns:"110px 1fr 90px 110px 90px", padding:"8px 14px", borderBottom:i<allCuts.length-1?"1px solid #0f1e2a":"none", background:i%2===0?"transparent":"#070d15", alignItems:"center" }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#c8a83a" }}>
                      {c.room?<span style={{ background:"#c8a83a18", border:"1px solid #c8a83a44", borderRadius:3, padding:"1px 5px" }}>{c.room}</span>:<span style={{ color:"#2a4a5a" }}>—</span>}
                    </span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#9adde8" }}>{c.opening}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#5a8a9a" }}>{c.piece}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#e8f4f8", fontWeight:600 }}>{fmt(c.length)}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#2a7080" }}>{fmtFt(c.length)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
