import { useState, useCallback, useRef, useEffect } from "react";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function gid() { return Math.random().toString(36).substr(2,9); }
function fmt(inches) {
  if (!inches && inches !== 0) return "—";
  const t = Math.max(0, inches);
  const ft = Math.floor(t/12), inch = Math.floor(t%12);
  const six = Math.round((t%1)*16);
  let s = ft>0?`${ft}′ `:"";
  s += `${inch}`; if(six>0) s+=` ${six}/16`; return s.trim()+"″";
}
function fmtFt(i){ return (i/12).toFixed(2)+" ft"; }
function today(){ return new Date().toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}); }

const CUT_TYPES  = ["Miter","Butt","Cope"];
const SIDES      = ["Left","Right","Both"];
const CORNERS    = ["Inside","Outside","Square"];
const WALL_LABELS= ["A","B","C","D","E","F","G","H","I","J","K","L"];
const STOCK      = 192; // 16 ft in inches
const SAVE_KEY   = "baseboardOptimizer_v1";

/* ─── thickness adjustment ───────────────────────────────────────────────── */
function adjustedLength(length, leftCut, rightCut, thickness) {
  // Miter and Cope cuts require adding the board thickness on that end
  const leftAdd  = (leftCut  === "Miter" || leftCut  === "Cope") ? thickness : 0;
  const rightAdd = (rightCut === "Miter" || rightCut === "Cope") ? thickness : 0;
  return length + leftAdd + rightAdd;
}

/* ─── scarf joint splitter ────────────────────────────────────────────────── */
function scarfSplit(piece, kerf) {
  // Split an oversized piece into 16' segments joined by scarf joints.
  // Each scarf joint loses one kerf width. The last segment gets the original
  // cut type on its right end; all intermediate segments get a butt right end.
  const segments = [];
  let remaining = piece.length;
  let part = 1;
  while (remaining > 0) {
    if (remaining > STOCK) {
      const segLen = STOCK - kerf; // leave kerf for scarf overlap
      segments.push({
        ...piece,
        id: `${piece.id}_scarf${part}`,
        length: segLen,
        rawLength: piece.rawLength || piece.length,
        scarfNote: `Part ${part} of ${fmt(piece.length)} — scarf joint →`,
        rightCut: "Butt", rightCorner: "Square",
        isScarf: true, scarfPart: part,
      });
      remaining -= segLen;
    } else {
      segments.push({
        ...piece,
        id: `${piece.id}_scarf${part}`,
        length: remaining,
        rawLength: piece.rawLength || piece.length,
        scarfNote: part > 1 ? `Part ${part} of ${fmt(piece.length)} — ← scarf joint` : null,
        isScarf: part > 1,
        scarfPart: part,
      });
      remaining = 0;
    }
    part++;
  }
  return segments;
}

/* ─── bin-pack optimizer ──────────────────────────────────────────────────── */
function optimize(pieces, wastePct, kerf=0.125) {
  const factor = 1 + wastePct/100;
  // split oversized pieces first
  const expanded = pieces.flatMap(p => p.length > STOCK ? scarfSplit(p, kerf) : [p]);
  const sorted   = [...expanded].sort((a,b)=>b.length-a.length);
  const boards   = [];
  for (const piece of sorted) {
    const needed  = piece.length * factor;
    let placed = false;
    for (const board of boards) {
      const kerfGap = board.cuts.length > 0 ? kerf : 0;
      if (board.remaining >= needed + kerfGap) {
        board.remaining -= needed + kerfGap;
        board.cuts.push(piece);
        placed = true; break;
      }
    }
    if (!placed) boards.push({ id:gid(), cuts:[piece], remaining:STOCK-needed, oversize:false });
  }
  return boards;
}

/* ─── cut type badge ──────────────────────────────────────────────────────── */
function CutBadge({ type }) {
  const colors = { Miter:"#3ab5c8", Butt:"#c8a83a", Cope:"#b57ec8" };
  return <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3, border:`1px solid ${colors[type]}55`, color:colors[type], fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>{type}</span>;
}
function CornerBadge({ corner }) {
  const colors = { Inside:"#7ec894", Outside:"#d47a3a", Square:"#6a8aaa" };
  return <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3, border:`1px solid ${colors[corner]}55`, color:colors[corner], fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>{corner}</span>;
}

/* ─── QtyInput ────────────────────────────────────────────────────────────── */
function QtyInput({ value, onChange }) {
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current && document.activeElement!==ref.current) ref.current.value=value===1?"":String(value); },[value]);
  return <input ref={ref} type="number" min={1} max={99} defaultValue="" placeholder="1"
    onChange={e=>{ const v=parseInt(e.target.value); onChange(isNaN(v)?1:Math.max(1,v)); }}
    onBlur={e=>{ if(!e.target.value) { onChange(1); e.target.value=""; } }}
    style={{ width:46, padding:"5px 6px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:13, textAlign:"center", outline:"none" }}/>;
}

/* ─── measurement input (ft-in or inches-only) ────────────────────────────── */
function toIn(ft, inch, sixteen) { return (parseInt(ft)||0)*12 + (parseInt(inch)||0) + (parseInt(sixteen)||0)/16; }
function parseIn(total) {
  const t = Math.max(0, total||0);
  return { ft:Math.floor(t/12), inch:Math.floor(t%12), sixteen:Math.round((t%1)*16) };
}

function MeasInput({ value, onChange }) {
  const [mode, setMode]     = useState("ftin"); // "ftin" | "in"
  const [ft,   setFt]       = useState("");
  const [inch, setInch]     = useState("");
  const [six,  setSix]      = useState("");
  const [inOnly, setInOnly] = useState("");
  const focused = useRef(false);

  // sync from external when not focused
  useEffect(()=>{
    if (focused.current) return;
    const p = parseIn(value||0);
    if (mode==="ftin") { setFt(p.ft||""); setInch(p.inch||""); setSix(p.sixteen||""); }
    else { setInOnly(value ? +value.toFixed(4) : ""); }
  }, [value]);

  const commitFtIn = (f,i,s) => onChange(toIn(f,i,s));
  const commitIn   = (v)     => onChange(parseFloat(v)||0);
  const switchMode = (m) => {
    setMode(m);
    if (m==="in") { setInOnly(value ? +value.toFixed(4) : ""); }
    else { const p=parseIn(value||0); setFt(p.ft||""); setInch(p.inch||""); setSix(p.sixteen||""); }
  };

  const iStyle = { padding:"5px 6px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:13, textAlign:"center", outline:"none" };
  const mBtn = (m,lbl) => (
    <button onClick={()=>switchMode(m)} style={{ padding:"2px 6px", borderRadius:3, border:"none", cursor:"pointer", background:mode===m?"#1e3a4a":"transparent", color:mode===m?"#9adde8":"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:9 }}>{lbl}</button>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:1 }}>{mBtn("ftin","ft-in")}{mBtn("in","in")}</div>
      <div onFocus={()=>focused.current=true} onBlur={()=>focused.current=false}>
        {mode==="ftin" ? (
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <input type="number" min={0} max={99} value={ft} placeholder="0"
              onChange={e=>{ setFt(e.target.value); commitFtIn(e.target.value,inch,six); }}
              style={{...iStyle, width:40}}/>
            <span style={{ color:"#2a5a6a", fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>′</span>
            <input type="number" min={0} max={11} value={inch} placeholder="0"
              onChange={e=>{ setInch(e.target.value); commitFtIn(ft,e.target.value,six); }}
              style={{...iStyle, width:36}}/>
            <span style={{ color:"#2a5a6a", fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>″</span>
            <input type="number" min={0} max={15} value={six} placeholder="0"
              onChange={e=>{ setSix(e.target.value); commitFtIn(ft,inch,e.target.value); }}
              style={{...iStyle, width:30}}/>
            <span style={{ color:"#2a5a6a", fontSize:10, fontFamily:"'JetBrains Mono',monospace" }}>/16</span>
          </div>
        ) : (
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <input type="number" min={0} step={0.0625} value={inOnly} placeholder="0"
              onChange={e=>{ setInOnly(e.target.value); commitIn(e.target.value); }}
              style={{...iStyle, width:80}}/>
            <span style={{ color:"#2a5a6a", fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>″</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Wall piece row ──────────────────────────────────────────────────────── */
function WallRow({ piece, onChange, onDelete, roomId }) {
  const stableId = `${roomId}_${piece.wall}_${piece.seq}`;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"flex-end", padding:"10px 12px", background:"#060e18", border:"1px solid #152535", borderRadius:8 }}>
      {/* Wall label */}
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Wall</span>
        <select value={piece.wall} onChange={e=>onChange({...piece,wall:e.target.value})}
          style={{ padding:"5px 6px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:13, outline:"none", width:58 }}>
          {WALL_LABELS.map(w=><option key={w}>{w}</option>)}
        </select>
      </div>

      {/* Length */}
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Length</span>
        <MeasInput value={piece.length} onChange={v=>onChange({...piece,length:v})}/>
      </div>

      {/* Left end */}
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Left End</span>
        <div style={{ display:"flex", gap:3 }}>
          <select value={piece.leftCut} onChange={e=>onChange({...piece,leftCut:e.target.value})}
            style={{ padding:"5px 6px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:12, outline:"none" }}>
            {CUT_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
          <select value={piece.leftCorner} onChange={e=>onChange({...piece,leftCorner:e.target.value})}
            style={{ padding:"5px 6px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:12, outline:"none" }}>
            {CORNERS.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Right end */}
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Right End</span>
        <div style={{ display:"flex", gap:3 }}>
          <select value={piece.rightCut} onChange={e=>onChange({...piece,rightCut:e.target.value})}
            style={{ padding:"5px 6px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:12, outline:"none" }}>
            {CUT_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
          <select value={piece.rightCorner} onChange={e=>onChange({...piece,rightCorner:e.target.value})}
            style={{ padding:"5px 6px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:12, outline:"none" }}>
            {CORNERS.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Qty */}
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Qty</span>
        <QtyInput value={piece.qty} onChange={v=>onChange({...piece,qty:v})}/>
      </div>

      {/* Notes */}
      <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1, minWidth:100 }}>
        <span style={{ fontSize:10, color:"#4a7a8a", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Notes</span>
        <input value={piece.notes} onChange={e=>onChange({...piece,notes:e.target.value})} placeholder="optional…"
          style={{ padding:"5px 8px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:5, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:12, outline:"none", width:"100%" }}/>
      </div>

      <button onClick={onDelete} style={{ background:"none", border:"none", color:"#2a5a6a", cursor:"pointer", fontSize:18, lineHeight:1, paddingBottom:4 }}>×</button>
    </div>
  );
}

/* ─── Room card ───────────────────────────────────────────────────────────── */
const PIECE_DEFAULTS = { wall:"A", length:0, leftCut:"Miter", leftCorner:"Inside", rightCut:"Miter", rightCorner:"Inside", qty:1, notes:"" };

function RoomCard({ room, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(true);
  const totalPieces = room.pieces.reduce((s,p)=>s+p.qty,0);

  const addPiece = () => {
    const usedWalls = room.pieces.map(p=>p.wall);
    const nextWall  = WALL_LABELS.find(w=>!usedWalls.includes(w)) || "A";
    const seq       = Date.now();
    onChange({ ...room, pieces:[...room.pieces, { ...PIECE_DEFAULTS, id:`${room.id}_${seq}`, wall:nextWall, seq }] });
  };
  const updatePiece = (updated) => onChange({ ...room, pieces:room.pieces.map(p=>p.id===updated.id?updated:p) });
  const deletePiece = (id)       => onChange({ ...room, pieces:room.pieces.filter(p=>p.id!==id) });

  return (
    <div style={{ background:"#0a1520", border:"1px solid #1a3040", borderRadius:10, overflow:"hidden" }}>
      {/* header */}
      <div onClick={()=>setExpanded(e=>!e)} style={{ padding:"11px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", borderBottom:expanded?"1px solid #1a3040":"none" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:9, padding:"2px 7px", border:"1px solid #3ab5c855", borderRadius:3, color:"#3ab5c8", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em" }}>Room</span>
          <input value={room.name} onClick={e=>e.stopPropagation()} onChange={e=>onChange({...room,name:e.target.value})}
            placeholder="Room name…"
            style={{ background:"transparent", border:"none", color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:15, fontWeight:600, outline:"none", width:180 }}/>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#2a5a6a" }}>{totalPieces} piece{totalPieces!==1?"s":""}</span>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button onClick={e=>{e.stopPropagation();onDelete();}} style={{ background:"none", border:"none", color:"#2a5a6a", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
          <span style={{ color:"#2a5a6a", fontSize:12 }}>{expanded?"▲":"▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 }}>
          {room.pieces.map(p=>(
            <WallRow key={p.id} piece={p} roomId={room.id} onChange={updatePiece} onDelete={()=>deletePiece(p.id)}/>
          ))}
          <button onClick={addPiece} style={{ padding:"9px", background:"transparent", border:"1px dashed #1a3040", borderRadius:7, color:"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer", transition:"all 0.2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#3ab5c8";e.currentTarget.style.color="#3ab5c8";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#1a3040";e.currentTarget.style.color="#2a6070";}}>
            + Add wall piece
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Board strip with checkboxes ─────────────────────────────────────────── */
function BoardStrip({ board, idx, checked, onToggle }) {
  const usedPct  = board.oversize ? 100 : Math.min(100,Math.round(((STOCK-board.remaining)/STOCK)*100));
  const allDone  = board.cuts.every(c=>checked[c.id]);
  const someDone = board.cuts.some(c=>checked[c.id]);
  const color    = "#3ab5c8";

  return (
    <div style={{ background:"#060e18", border:`1px solid ${allDone?"#2a6040":"#152535"}`, borderRadius:8, padding:"10px 12px", display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#3a8090", textTransform:"uppercase", letterSpacing:"0.06em" }}>Board {idx+1} · 16′</span>
          {allDone  && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#7ec894", background:"#7ec89418", border:"1px solid #7ec89444", borderRadius:3, padding:"1px 6px" }}>✓ Complete</span>}
          {someDone && !allDone && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#c8a83a", background:"#c8a83a18", border:"1px solid #c8a83a44", borderRadius:3, padding:"1px 6px" }}>In Progress</span>}
          {board.oversize && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#d47a3a", background:"#d47a3a18", border:"1px solid #d47a3a44", borderRadius:3, padding:"1px 6px" }}>⚠ Oversize</span>}
        </div>
        {!board.oversize && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:usedPct>85?"#7ec894":usedPct>60?"#c8a83a":"#4a8090" }}>{usedPct}% used · {fmt(board.remaining)} left</span>}
      </div>
      {!board.oversize && (
        <div style={{ height:8, background:"#0f1923", borderRadius:4, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${usedPct}%`, background:`linear-gradient(90deg,${color}99,${color})`, borderRadius:4 }}/>
        </div>
      )}
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {board.cuts.map(c=>{
          const done = !!checked[c.id];
          return (
            <div key={c.id} onClick={()=>onToggle(c.id)}
              style={{ padding:"8px 10px", background:done?"#0a2018":"#0a1520", border:`1px solid ${done?"#3a7050":"#1a3a4a"}`, borderRadius:6, cursor:"pointer", display:"flex", flexDirection:"column", gap:4, transition:"all 0.15s", minWidth:80, position:"relative" }}>
              {/* checkbox */}
              <div style={{ position:"absolute", top:6, right:6, width:20, height:20, borderRadius:4, border:`2px solid ${done?"#7ec894":"#2a5a6a"}`, background:done?"#7ec894":"transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
                {done && <svg width="12" height="10" viewBox="0 0 12 10" fill="none"><polyline points="1.5,5 4.5,8.5 10.5,1.5" stroke="#060e18" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              {/* length */}
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:done?"#7ec894":"#e8f4f8", fontWeight:700, paddingRight:24, textDecoration:done?"line-through":"none" }}>{fmt(c.length)}</div>
              {c.rawLength !== undefined && c.rawLength !== c.length && (
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#4a7a6a" }}>wall: {fmt(c.rawLength)}</div>
              )}
              {/* room + wall */}
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                {c.room && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#c8a83a" }}>{c.room}</span>}
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#3a7a8a" }}>Wall {c.wall}</span>
              </div>
              {/* cut info */}
              <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                <CutBadge type={c.leftCut}/>
                <CornerBadge corner={c.leftCorner}/>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#2a5a6a" }}>↔</span>
                <CutBadge type={c.rightCut}/>
                <CornerBadge corner={c.rightCorner}/>
              </div>
              {c.scarfNote && <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#d47a3a", fontStyle:"italic" }}>{c.scarfNote}</div>}
              {c.notes && <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#4a7a6a", fontStyle:"italic" }}>{c.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Print View ──────────────────────────────────────────────────────────── */
const PRINT_CSS = `
  @media print {
    body { background:white!important; color:#111!important; }
    .no-print { display:none!important; }
    .print-only { display:block!important; }
  }
  .print-only { display:none; }
`;

function PrintView({ jobName, rooms, boards, allCuts, wastePct }) {
  const totalLF = boards.filter(b=>!b.oversize).length * 16;
  const usedLF  = allCuts.reduce((s,c)=>s+c.length,0)/12;
  return (
    <div className="print-only" style={{ fontFamily:"'JetBrains Mono',monospace", padding:32, background:"white", color:"#111" }}>
      <div style={{ borderBottom:"2px solid #111", paddingBottom:12, marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:700, letterSpacing:"0.05em" }}>BASEBOARD CUT LIST</div>
        <div style={{ fontSize:16, marginTop:4 }}>{jobName||"Untitled Job"}</div>
        <div style={{ fontSize:11, color:"#555", marginTop:4 }}>Generated: {today()} · Stock: 16′ · Waste factor: {wastePct}%</div>
      </div>
      <div style={{ display:"flex", gap:24, marginBottom:20, fontSize:12 }}>
        {[["Rooms",rooms.length],["Total Pieces",allCuts.length],["Boards",boards.length],["Used LF",`${usedLF.toFixed(1)}′`]].map(([l,v])=>(
          <div key={l}><div style={{ fontSize:9, textTransform:"uppercase", color:"#888", letterSpacing:"0.1em" }}>{l}</div><div style={{ fontSize:18, fontWeight:700 }}>{v}</div></div>
        ))}
      </div>
      {/* by room */}
      {rooms.map(room=>{
        const rPieces = allCuts.filter(c=>c.room===room.name);
        if (!rPieces.length) return null;
        return (
          <div key={room.id} style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:700, borderBottom:"1px solid #ccc", paddingBottom:4, marginBottom:8 }}>{room.name}</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead><tr style={{ background:"#f5f5f5" }}>
                {["Wall","Length","Left Cut","Left Corner","Right Cut","Right Corner","Notes"].map(h=>(
                  <th key={h} style={{ padding:"4px 8px", textAlign:"left", fontSize:9, textTransform:"uppercase", letterSpacing:"0.08em", color:"#555" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rPieces.map((c,i)=>(
                  <tr key={c.id} style={{ background:i%2===0?"white":"#fafafa", borderBottom:"1px solid #eee" }}>
                    <td style={{ padding:"4px 8px", fontWeight:700 }}>Wall {c.wall}</td>
                    <td style={{ padding:"4px 8px", fontWeight:700 }}>
                      {fmt(c.length)}
                      {c.rawLength !== undefined && c.rawLength !== c.length && <div style={{ fontSize:9, color:"#888", fontWeight:400 }}>wall: {fmt(c.rawLength)}</div>}
                    </td>
                    <td style={{ padding:"4px 8px" }}>{c.leftCut}</td>
                    <td style={{ padding:"4px 8px" }}>{c.leftCorner}</td>
                    <td style={{ padding:"4px 8px" }}>{c.rightCut}</td>
                    <td style={{ padding:"4px 8px" }}>{c.rightCorner}</td>
                    <td style={{ padding:"4px 8px", color:"#666" }}>{c.notes||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {/* board layout */}
      <div style={{ fontSize:13, fontWeight:700, borderBottom:"1px solid #ccc", paddingBottom:4, marginBottom:10 }}>Board Layout</div>
      {boards.map((b,i)=>(
        <div key={b.id} style={{ marginBottom:10, padding:8, border:"1px solid #ddd", borderRadius:4 }}>
          <div style={{ fontSize:11, fontWeight:600, marginBottom:4 }}>
            Board {i+1} — 16′{b.oversize?" (OVERSIZE — needs longer stock)":` · ${Math.min(100,Math.round(((STOCK-b.remaining)/STOCK)*100))}% used · ${fmt(b.remaining)} remaining`}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
            {b.cuts.map(c=>(
              <div key={c.id} style={{ padding:"3px 8px", background:"#f0f8ff", border:"1px solid #acd", borderRadius:3, fontSize:10 }}>
                <span style={{ fontWeight:700 }}>{fmt(c.length)}</span>
                <span style={{ color:"#555", marginLeft:4 }}>{c.room} · Wall {c.wall} · L:{c.leftCut}/{c.leftCorner} R:{c.rightCut}/{c.rightCorner}{c.scarfNote?" · "+c.scarfNote:""}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── App ─────────────────────────────────────────────────────────────────── */
export default function BaseboardCalculator() {
  const [jobName,  setJobName]  = useState("");
  const [rooms,    setRooms]    = useState([{ id:gid(), name:"Room 1", pieces:[] }]);
  const [wastePct,   setWastePct]   = useState(10);
  const [thickness,  setThickness]  = useState(0.75);
  const [kerf,       setKerf]       = useState(0.125); // blade kerf, default 1/8"
  const [tab,        setTab]        = useState("input");
  const [checked,    setChecked]    = useState({});
  const [saveMsg,    setSaveMsg]    = useState("");

  // load saved
  useEffect(()=>{
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.jobName  !== undefined) setJobName(s.jobName);
        if (s.rooms    !== undefined) setRooms(s.rooms);
        if (s.wastePct   !== undefined) setWastePct(s.wastePct);
        if (s.thickness  !== undefined) setThickness(s.thickness);
        if (s.kerf       !== undefined) setKerf(s.kerf);
      }
    } catch(e){}
  },[]);

  const saveJob = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ jobName, rooms, wastePct, thickness, kerf }));
      setSaveMsg("Saved ✓"); setTimeout(()=>setSaveMsg(""),2000);
    } catch(e){ setSaveMsg("Save failed"); }
  };

  const newJob = () => {
    if (!window.confirm("Start a new job? Unsaved changes will be lost.")) return;
    setJobName(""); setRooms([{id:gid(),name:"Room 1",pieces:[]}]); setWastePct(10); setThickness(0.75); setKerf(0.125); setTab("input"); setChecked({});
    localStorage.removeItem(SAVE_KEY);
  };

  const updateRoom = useCallback((u)=>setRooms(prev=>prev.map(r=>r.id===u.id?u:r)),[]);

  // expand pieces by qty for optimizer
  const allCuts = rooms.flatMap(room=>
    room.pieces.flatMap(p=>{
      const cuts = [];
      for (let i=0; i<p.qty; i++) {
        const adj = adjustedLength(p.length, p.leftCut, p.rightCut, thickness);
        cuts.push({
          id: `${p.id}_${i}`,
          room: room.name, wall: p.wall,
          length: adj,          // adjusted cut length for stock
          rawLength: p.length,  // original wall measurement
          leftCut: p.leftCut, leftCorner: p.leftCorner,
          rightCut: p.rightCut, rightCorner: p.rightCorner,
          notes: p.notes
        });
      }
      return cuts;
    })
  ).filter(c=>c.length>0);

  const boards   = optimize(allCuts, wastePct, kerf);
  const totalLF  = boards.filter(b=>!b.oversize).length * 16;
  const usedLF   = allCuts.reduce((s,c)=>s+c.length,0)/12;
  const doneCount= Object.values(checked).filter(Boolean).length;

  const pill = (label, active, onClick, color="#3ab5c8") => (
    <button onClick={onClick} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${active?color:"#1a3040"}`, background:active?`${color}18`:"transparent", color:active?color:"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>{label}</button>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#070f18", color:"#e8f4f8" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
        select{cursor:pointer;}
        ::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:#060e18;}::-webkit-scrollbar-thumb{background:#1a3040;border-radius:3px;}
        ${PRINT_CSS}
      `}</style>

      <PrintView jobName={jobName} rooms={rooms} boards={boards} allCuts={allCuts} wastePct={wastePct}/>

      {/* Header */}
      <div className="no-print" style={{ background:"#060e18", borderBottom:"1px solid #122030", padding:"0 20px" }}>
        <div style={{ maxWidth:980, margin:"0 auto", display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", padding:"10px 0" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
            <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:"0.08em", color:"#c8a83a", whiteSpace:"nowrap" }}>BASEBOARD OPTIMIZER</h1>
          </div>
          <input value={jobName} onChange={e=>setJobName(e.target.value)} placeholder="Job name…"
            style={{ flex:1, minWidth:150, maxWidth:280, padding:"7px 12px", background:"#0f1923", border:"1px solid #1e3a4a", borderRadius:7, color:"#e8f4f8", fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:600, outline:"none" }}/>
          <div style={{ display:"flex", gap:6, marginLeft:"auto", flexWrap:"wrap" }}>
            {pill("⬡  Rooms",     tab==="input",   ()=>setTab("input"),   "#c8a83a")}
            {pill(`⬢  Cut List (${boards.length})`, tab==="results", ()=>setTab("results"), "#7ec894")}
            <button onClick={saveJob} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #1a5040", background:"#0a2a20", color:"#4ec894", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>{saveMsg||"💾 Save"}</button>
            <button onClick={()=>window.print()} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #1a3a5a", background:"#0a1a2a", color:"#6ab4d8", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>🖨 Print / PDF</button>
            <button onClick={newJob} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #2a2030", background:"transparent", color:"#4a3a5a", fontFamily:"'JetBrains Mono',monospace", fontSize:12, cursor:"pointer" }}>＋ New Job</button>
          </div>
        </div>
      </div>

      <div className="no-print" style={{ maxWidth:980, margin:"0 auto", padding:"20px" }}>

        {/* Settings bar */}
        <div style={{ background:"#0a1520", border:"1px solid #1a3040", borderRadius:10, padding:"12px 16px", marginBottom:18, display:"flex", flexWrap:"wrap", gap:16, alignItems:"center" }}>
          <div>
            <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:6 }}>Stock Length</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, color:"#c8a83a", fontWeight:700 }}>16′ (192″) Standard</span>
          </div>
          <div>
            <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:6 }}>Waste Factor</span>
            <div style={{ display:"flex", gap:5 }}>
              {[5,10,15,20].map(p=>pill(`${p}%`,wastePct===p,()=>setWastePct(p),"#c8a83a"))}
            </div>
          </div>
          <div>
            <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:6 }}>Board Thickness</span>
            <div style={{ display:"flex", gap:5, alignItems:"center" }}>
              {[["1/4",0.25],["3/8",0.375],["1/2",0.5],["5/8",0.625],["3/4",0.75],["1",1.0]].map(([lbl,val])=>(
                <button key={lbl} onClick={()=>setThickness(val)} style={{ padding:"5px 10px", borderRadius:5, border:`1px solid ${thickness===val?"#c8a83a":"#1a3040"}`, background:thickness===val?"#c8a83a18":"transparent", color:thickness===val?"#c8a83a":"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:11, cursor:"pointer" }}>{lbl}″</button>
              ))}
            </div>
          </div>
          <div>
            <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:6 }}>Blade Kerf</span>
            <div style={{ display:"flex", gap:5 }}>
              {[["1/16",0.0625],["1/8",0.125],["3/16",0.1875]].map(([lbl,val])=>(
                <button key={lbl} onClick={()=>setKerf(val)} style={{ padding:"5px 10px", borderRadius:5, border:`1px solid ${kerf===val?"#9adde8":"#1a3040"}`, background:kerf===val?"#9adde818":"transparent", color:kerf===val?"#9adde8":"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:11, cursor:"pointer" }}>{lbl}″</button>
              ))}
            </div>
          </div>
          <div style={{ marginLeft:"auto", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#2a6070", textAlign:"right" }}>
            <div>{allCuts.length} pieces · {boards.length} boards · {totalLF} lin ft stock</div>
            <div style={{ color:"#1a5060" }}>Used: {usedLF.toFixed(1)} ft</div>
          </div>
        </div>

        {/* Rooms Tab */}
        {tab==="input" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {rooms.map(r=>(
              <RoomCard key={r.id} room={r} onChange={updateRoom} onDelete={()=>setRooms(prev=>prev.filter(x=>x.id!==r.id))}/>
            ))}
            <button onClick={()=>setRooms(prev=>[...prev,{id:gid(),name:`Room ${prev.length+1}`,pieces:[]}])}
              style={{ padding:"12px", background:"transparent", border:"1px dashed #1a3040", borderRadius:10, color:"#2a6070", fontFamily:"'JetBrains Mono',monospace", fontSize:13, cursor:"pointer", transition:"all 0.2s" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#c8a83a";e.currentTarget.style.color="#c8a83a";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#1a3040";e.currentTarget.style.color="#2a6070";}}>
              + Add Room
            </button>
            {allCuts.length>0 && (
              <button onClick={()=>setTab("results")} style={{ padding:"13px", background:"#c8a83a", border:"none", borderRadius:10, color:"#06101a", fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:"0.08em", textTransform:"uppercase" }}>
                Generate Cut List → {boards.length} boards · {totalLF} lin ft
              </button>
            )}
          </div>
        )}

        {/* Results Tab */}
        {tab==="results" && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            {jobName && <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:"#c8a83a", letterSpacing:"0.08em" }}>{jobName}</div>}

            {/* summary cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:10 }}>
              {[{l:"Rooms",v:rooms.length,c:"#c8a83a"},{l:"Pieces",v:allCuts.length,c:"#9adde8"},{l:"Boards",v:boards.length,c:"#7ec894"},{l:"Stock LF",v:`${totalLF}′`,c:"#c8a83a"},{l:"Used LF",v:`${usedLF.toFixed(1)}′`,c:"#d47a3a"},{l:"Waste",v:`${wastePct}%`,c:"#8a8aaa"}].map(({l,v,c})=>(
                <div key={l} style={{ background:"#0a1520", border:"1px solid #1a3040", borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#2a6070", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>{l}</div>
                  <div style={{ fontSize:26, color:c, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:"0.05em" }}>{v}</div>
                </div>
              ))}
            </div>

            {/* progress + boards */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#3a8090", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                  {doneCount} of {allCuts.length} cuts complete
                </span>
                <button onClick={()=>setChecked({})} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#3a5060", background:"transparent", border:"none", cursor:"pointer", textDecoration:"underline" }}>Reset all</button>
              </div>
              {boards.map((b,i)=><BoardStrip key={b.id} board={b} idx={i} checked={checked} onToggle={id=>setChecked(prev=>({...prev,[id]:!prev[id]}))}/>)}
            </div>

            {/* full cut list by room */}
            <div>
              <span style={{ fontSize:10, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:8 }}>Full Cut List by Room</span>
              {rooms.map(room=>{
                const rCuts = allCuts.filter(c=>c.room===room.name);
                if (!rCuts.length) return null;
                return (
                  <div key={room.id} style={{ marginBottom:14 }}>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#c8a83a", fontWeight:700, marginBottom:6, padding:"5px 10px", background:"#c8a83a12", borderRadius:5, display:"inline-block" }}>{room.name}</div>
                    <div style={{ background:"#0a1520", border:"1px solid #1a3040", borderRadius:10, overflow:"hidden" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"60px 90px 90px 100px 90px 100px 1fr", padding:"7px 14px", borderBottom:"1px solid #122030", background:"#060e18" }}>
                        {["Wall","Length","L-Cut","L-Corner","R-Cut","R-Corner","Notes"].map(h=>(
                          <span key={h} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#2a6070", textTransform:"uppercase", letterSpacing:"0.08em" }}>{h}</span>
                        ))}
                      </div>
                      {rCuts.map((c,i)=>(
                        <div key={c.id} style={{ display:"grid", gridTemplateColumns:"60px 90px 90px 100px 90px 100px 1fr", padding:"7px 14px", borderBottom:i<rCuts.length-1?"1px solid #0f1e2a":"none", background:i%2===0?"transparent":"#070d15", alignItems:"center" }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#c8a83a", fontWeight:700 }}>Wall {c.wall}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#e8f4f8", fontWeight:600 }}>
                            {fmt(c.length)}
                            {c.rawLength !== undefined && c.rawLength !== c.length && (
                              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#4a7a6a", marginLeft:4 }}>wall: {fmt(c.rawLength)}</span>
                            )}
                          </span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}><CutBadge type={c.leftCut}/></span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}><CornerBadge corner={c.leftCorner}/></span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}><CutBadge type={c.rightCut}/></span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}><CornerBadge corner={c.rightCorner}/></span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#4a7a6a" }}>{c.notes||"—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
