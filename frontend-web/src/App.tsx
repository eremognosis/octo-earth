import { FormEvent, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Frame, HeliocentricScene } from "./scene/HeliocentricScene";
import { DualScaleHUD, ScaleData } from "./components/DualScaleHUD";

const bodies = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Sun", "Moon"];
type Config = {
  target_au: number; max_years: number; frames: number;
  propulsion_enabler: boolean;
  structural_enabler: boolean; superconducting_enabler: boolean;
};

function parseWorld(data: ArrayBuffer): Frame[] {
  const view = new DataView(data), frames: Frame[] = [];
  for (let offset = 0; offset + 272 <= data.byteLength; offset += 272) {
    const positions = Array.from({ length: 10 }, (_, body) => [
      view.getFloat64(offset + 8 + body * 24, true),
      view.getFloat64(offset + 16 + body * 24, true),
      view.getFloat64(offset + 24 + body * 24, true),
    ]);
    const rawStatus = view.getUint8(offset + 264);
    frames.push({
      time: view.getFloat64(offset, true), positions,
      separation: view.getFloat64(offset + 248, true),
      minimumSunDistance: view.getFloat64(offset + 256, true),
      // Collision is a finite-radius result computed by the C++ core.
      // Do not reclassify browser coordinates independently.
      status: rawStatus,
    });
  }
  return frames;
}

function statusText(status: number) {
  const values = [
    [8, "collision"], [16, "life compromised"], [32, "journey incomplete"],
    [1, "crust shear"], [2, "arm failure"], [4, "quench"],
  ];
  return values.filter(([bit]) => (status & Number(bit)) !== 0).map(([, text]) => text).join(", ") || "nominal";
}

export function App() {
  const [config, setConfig] = useState<Config>({
    target_au: 2.7, max_years: 10000, frames: 500000,
    propulsion_enabler: true,
    structural_enabler: true, superconducting_enabler: true,
  });
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(30);
  const [followEarth, setFollowEarth] = useState(false);
  const tRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [scaleData, setScaleData] = useState<ScaleData | null>(null);
  const current = frames[selected];
  const enabledCount = [
    config.propulsion_enabler, config.structural_enabler, config.superconducting_enabler,
  ].filter(Boolean).length;
  const allEnablers = enabledCount === 3;
  const missionFailed = Boolean(current && (!allEnablers || current.status));
  const update = (key: keyof Config, value: number | boolean) =>
    setConfig((old) => ({ ...old, [key]: value }));

  async function run(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setFrames([]);
    tRef.current = 0; setSelected(0);
    try {
      const response = await fetch("/api/ephemeris", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error(await response.text());
      setFrames(parseWorld(await response.arrayBuffer()));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed"); }
    finally { setBusy(false); }
  }

  const logUrl = `/api/compliance-log?${new URLSearchParams({
    target_au: String(config.target_au),
    max_years: String(config.max_years),
    arm_length_m: "12000000",
    jc_limit_a_m2: "1e25",
    yield_strength_pa: "1.5e18",
    propulsion_enabler: String(config.propulsion_enabler),
    structural_enabler: String(config.structural_enabler),
    superconducting_enabler: String(config.superconducting_enabler),
    frames: String(config.frames),
  }).toString()}`;

  return <main className="mission-shell">
    <header className="mission-header"><div><p className="eyebrow">PROJECT OCTO-EARTH · HELIOCENTRIC OBSERVATORY</p><h1>Deep space mission control</h1></div><span className={busy ? "badge running" : "badge"}>{busy ? "SIMULATING" : "READY"}</span></header>
    <section className="grid">
      <form className="panel controls" onSubmit={run}>
        <div className="panel-heading"><span className="section-kicker">FLIGHT CONFIGURATION</span><h2>Simulation inputs</h2></div>
        <label>Target orbit (AU)<input type="number" min="0.1" step="0.01" value={config.target_au} onChange={(e) => update("target_au", Number(e.target.value))} /></label>
        <label>Duration (years)<input type="number" min="1" step="1" value={config.max_years} onChange={(e) => update("max_years", Number(e.target.value))} /></label>
        <label>Output frames<input type="number" min="1" max="1000000" value={config.frames} onChange={(e) => update("frames", Number(e.target.value))} /></label>
        <h3>Enablers</h3>
        {([
          ["propulsion_enabler", "Antimatter-Catalyzed Relativistic Energy Core"],
          ["structural_enabler", "Nonlocal Momentum-Exchange Vectoring Array"],
          ["superconducting_enabler", "AGCAHS: adaptive habitat + climate shield"],
        ] as const).map(([key, label]) => <label className="toggle" key={key}><input type="checkbox" checked={config[key]} onChange={(e) => update(key, e.target.checked)} />{label}</label>)}
        <button disabled={busy}>{busy ? "Running..." : "Run simulation"}</button>
        {error && <p className="error">{error}</p>}
      </form>
      <section className="panel telemetry">
        <div className="panel-title"><div><span className="section-kicker">LIVE OBSERVATORY FEED</span><h2>Heliocentric system</h2></div><span>{frames.length} frames</span></div>
        {!current ? <div className="empty">Run a simulation to inspect numerical ephemeris data.</div> : <>
          <div className="space-view">
            <Canvas
              camera={{ position: [0, 40, 60], fov: 50 }}
              dpr={[1, 2]}
              gl={{ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true }}
            >
              <HeliocentricScene
                frames={frames}
                playing={playing}
                speed={speed}
                followEarth={followEarth}
                tRef={tRef}
                onFrame={setSelected}
                activeFrame={selected}
                onScaleChange={setScaleData}
              />
            </Canvas>
            <DualScaleHUD scale={scaleData} />
            <div style={{
              position: "absolute", zIndex: 2, left: 340, bottom: 8,
              padding: "5px 8px", borderRadius: 4,
              background: "rgba(5, 14, 28, .82)", color: "#7892aa",
              fontSize: 9, pointerEvents: "auto",
            }}>
              Planet maps:{" "}
              <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer" style={{ color: "#b9eaff" }}>
                Solar System Scope · CC BY 4.0
              </a>
              {" · Moon: "}
              <a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer" style={{ color: "#b9eaff" }}>
                NASA SVS
              </a>
            </div>
            <div className="earth-hud">
              <span className="hud-label"><i className="live-dot" /> EARTH TELEMETRY</span>
              <strong>{current.time.toFixed(2)} <small>YEARS ELAPSED</small></strong>
              <div className="hud-coordinates">
                <span>X <b>{current.positions[2][0].toFixed(4)} AU</b></span>
                <span>Y <b>{current.positions[2][1].toFixed(4)} AU</b></span>
                <span>Z <b>{current.positions[2][2].toFixed(4)} AU</b></span>
              </div>
              <span className="hud-distance">CLOSEST BODY TO SUN <b>{current.minimumSunDistance.toFixed(4)} AU</b></span>
              <span className="hud-distance">ORBIT MODEL <b>JPL/NASA J2000 · INCLINED PLANES</b></span>
              <div className="body-coordinate-matrix">
                <div className="matrix-heading"><span>BODY</span><span>X / Y / Z · AU</span></div>
                {bodies.map((body, index) => {
                  const [x, y, z] = current.positions[index];
                  return <div className="matrix-row" key={body}>
                    <span>{body}</span>
                    <b>{x.toFixed(3)} / {y.toFixed(3)} / {z.toFixed(3)}</b>
                  </div>;
                })}
              </div>
              <span className={current.status ? "hud-status warning" : "hud-status safe"}>
                {current.status ? `CONSTRAINT STATUS · ${statusText(current.status)}` : "NOMINAL · ORBITAL LOCK"}
              </span>
              <div className={`constraint-verdict ${missionFailed ? "failed" : "passed"}`}>
                <span>{missionFailed ? "CONSTRAINTS FAILING" : "CONSTRAINTS CLEAR"}</span>
                <b>{current.time >= config.max_years
                  ? (missionFailed ? "RULEBOOK CHECK FAILED" : "RULEBOOK CHECK PASSED")
                  : "MISSION IN PROGRESS"}</b>
              </div>
              <button className="audit-button" type="button" onClick={() => setAuditOpen((open) => !open)}>
                {auditOpen ? "Hide compliance logs" : "Open compliance logs"}
              </button>
              {auditOpen && <div className="audit-drawer">
                <strong>RULEBOOK AUDIT TRAIL</strong>
                <span>Generated from this run. ACREC powers orbital refractors for climate heat; NMEVA supplies the external reaction path; AGCAHS retains and distributes habitat heat.</span>
                <a className="download-audit" href={logUrl} download="octo-compliance-logs.zip">
                  DOWNLOAD THIS RUN <b>ZIP ↧</b>
                </a>
                <span>Bundle contains summary, collision, conservation, angular-momentum, habitability, and convergence logs.</span>
              </div>}
            </div>
          </div>
          <div className="scenario-strip">
            <span className="section-kicker">DECLARED CONFIGURATION</span>
            <strong>{enabledCount}/3 hypothetical enablers online</strong>
            <small>{missionFailed ? "Declared constraints are visible in the telemetry feed" : "Three bounded enablers selected; measured checks are available in the logs"}</small>
          </div>
          <div className="scene-controls">
            <button type="button" onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => setFollowEarth((f) => !f)}>
              {followEarth ? "Camera: Following Earth" : "Camera: Centered on Sun"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              Speed ({speed} fps)
              <input type="range" min="1" max="1000" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            </label>
          </div>
          <input
            className="scrubber"
            type="range"
            min="0"
            max={frames.length - 1}
            value={selected}
            onChange={(e) => {
              const idx = Number(e.target.value);
              tRef.current = idx;
              setSelected(idx);
            }}
          />
          <div className="metrics"><div><small>Min separation</small><strong>{current.separation.toExponential(4)} AU</strong></div><div><small>Tracked bodies</small><strong>{bodies.length - 1} orbiting</strong></div><div><small>Orbital display</small><strong>Current revolution</strong></div></div>
        </>}
      </section>
    </section>
  </main>;
}
