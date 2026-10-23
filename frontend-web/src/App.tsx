import { FormEvent, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Frame, HeliocentricScene } from "./scene/HeliocentricScene";

const bodies = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Sun", "Moon"];
type Config = {
  target_au: number; max_years: number; frames: number;
  gravity_tether_on: boolean; propulsion_enabler: boolean;
  structural_enabler: boolean; superconducting_enabler: boolean;
};

function parseWorld(data: ArrayBuffer): Frame[] {
  const view = new DataView(data), frames: Frame[] = [];
  for (let offset = 0; offset + 264 <= data.byteLength; offset += 264) {
    const positions = Array.from({ length: 10 }, (_, body) => [
      view.getFloat64(offset + 8 + body * 24, true),
      view.getFloat64(offset + 16 + body * 24, true),
      view.getFloat64(offset + 24 + body * 24, true),
    ]);
    frames.push({
      time: view.getFloat64(offset, true), positions,
      separation: view.getFloat64(offset + 248, true),
      status: view.getUint8(offset + 256),
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
    target_au: 2.7, max_years: 10000, frames: 500,
    gravity_tether_on: true, propulsion_enabler: true,
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
  const current = frames[selected];
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

  return <main>
    <header><div><p className="eyebrow">PROJECT OCTO-EARTH</p><h1>Mission control</h1></div><span className={busy ? "badge running" : "badge"}>{busy ? "SIMULATING" : "READY"}</span></header>
    <section className="grid">
      <form className="panel controls" onSubmit={run}>
        <h2>Simulation inputs</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setConfig((old) => ({ ...old, max_years: 30, frames: 3000 }))}
          >
            Preset: Orbit (30 yr)
          </button>
          <button
            type="button"
            onClick={() => setConfig((old) => ({ ...old, max_years: 10000, frames: 1000 }))}
          >
            Preset: Journey (10k yr)
          </button>
        </div>
        <label>Target orbit (AU)<input type="number" min="0.1" step="0.01" value={config.target_au} onChange={(e) => update("target_au", Number(e.target.value))} /></label>
        <label>Duration (years)<input type="number" min="1" step="1" value={config.max_years} onChange={(e) => update("max_years", Number(e.target.value))} /></label>
        <label>Output frames<input type="number" min="1" max="1000000" value={config.frames} onChange={(e) => update("frames", Number(e.target.value))} /></label>
        <h3>Enablers</h3>
        {([
          ["gravity_tether_on", "Gravity tether"], ["propulsion_enabler", "Lorentz propulsion"],
          ["structural_enabler", "Strong-force structure"], ["superconducting_enabler", "Superconductor"],
        ] as const).map(([key, label]) => <label className="toggle" key={key}><input type="checkbox" checked={config[key]} onChange={(e) => update(key, e.target.checked)} />{label}</label>)}
        <button disabled={busy}>{busy ? "Running..." : "Run simulation"}</button>
        {error && <p className="error">{error}</p>}
      </form>
      <section className="panel telemetry">
        <div className="panel-title"><h2>World telemetry</h2><span>{frames.length} frames received</span></div>
        {!current ? <div className="empty">Run a simulation to inspect numerical ephemeris data.</div> : <>
          <div style={{ height: 460, borderRadius: 8, overflow: "hidden", background: "#060913", marginBottom: 12 }}>
            <Canvas camera={{ position: [0, 40, 60], fov: 50 }}>
              <HeliocentricScene
                frames={frames}
                playing={playing}
                speed={speed}
                followEarth={followEarth}
                tRef={tRef}
                onFrame={setSelected}
              />
            </Canvas>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => setFollowEarth((f) => !f)}>
              {followEarth ? "Camera: Following Earth" : "Camera: Centered on Sun"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              Speed ({speed} fps)
              <input type="range" min="1" max="120" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
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
          <div className="metrics"><div><small>Time</small><strong>{current.time.toFixed(2)} years</strong></div><div><small>Min separation</small><strong>{current.separation.toExponential(4)} AU</strong></div><div><small>Status</small><strong className={current.status ? "danger" : "safe"}>{statusText(current.status)}</strong></div></div>
          <table><thead><tr><th>Body</th><th>X (AU)</th><th>Y (AU)</th><th>Z (AU)</th></tr></thead><tbody>{current.positions.map((position, i) => <tr key={bodies[i]}><td>{bodies[i]}</td><td>{position[0].toFixed(8)}</td><td>{position[1].toFixed(8)}</td><td>{position[2].toFixed(8)}</td></tr>)}</tbody></table>
        </>}
      </section>
    </section>
  </main>;
}
