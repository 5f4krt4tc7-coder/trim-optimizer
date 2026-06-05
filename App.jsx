import { useState } from "react";
import TrimCalculator from "./TrimCalculator";
import BaseboardCalculator from "./BaseboardCalculator";

export default function App() {
  const [tool, setTool] = useState("home");

  if (tool === "trim")      return <div><BackBtn onClick={()=>setTool("home")}/><TrimCalculator/></div>;
  if (tool === "baseboard") return <div><BackBtn onClick={()=>setTool("home")}/><BaseboardCalculator/></div>;

  return (
    <div style={{ minHeight:"100vh", background:"#070f18", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:32, padding:24 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
      <div style={{ textAlign:"center" }}>
        <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:42, color:"#e8f4f8", letterSpacing:"0.1em" }}>TRIM OPTIMIZER</h1>
        <p style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#2a6070", marginTop:6 }}>Select a calculator to get started</p>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:16, width:"100%", maxWidth:360 }}>
        <ToolCard
          title="Trim Calculator"
          subtitle="Doors · Windows · Casing"
          color="#3ab5c8"
          icon="🪟"
          onClick={()=>setTool("trim")}
        />
        <ToolCard
          title="Baseboard Optimizer"
          subtitle="Walls · Miter · Cope · Butt"
          color="#c8a83a"
          icon="📐"
          onClick={()=>setTool("baseboard")}
        />
      </div>
      <p style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#1a3040", textAlign:"center" }}>
        Add to Home Screen in Safari for app-like experience
      </p>
    </div>
  );
}

function ToolCard({ title, subtitle, color, icon, onClick }) {
  return (
    <button onClick={onClick} style={{ padding:"20px 24px", background:"#0a1520", border:`1px solid ${color}44`, borderRadius:12, cursor:"pointer", textAlign:"left", transition:"all 0.2s", display:"flex", alignItems:"center", gap:16 }}
      onMouseEnter={e=>e.currentTarget.style.borderColor=color}
      onMouseLeave={e=>e.currentTarget.style.borderColor=`${color}44`}>
      <span style={{ fontSize:32 }}>{icon}</span>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color, letterSpacing:"0.08em" }}>{title}</div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#2a6070", marginTop:2 }}>{subtitle}</div>
      </div>
    </button>
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ position:"fixed", top:12, left:12, zIndex:1000, padding:"6px 12px", background:"#0a1520", border:"1px solid #1a3040", borderRadius:6, color:"#3a8090", fontFamily:"'JetBrains Mono',monospace", fontSize:11, cursor:"pointer" }}>
      ← Home
    </button>
  );
}
