export interface ScaleData {
  orbitAu: number;
  orbitKm: number;
  planetKm: number;
  planetAu: number;
  ratio: number;
  cameraDistance: number;
  zoomFactor: number;
  barWidthPx: number;
}

export function formatAu(val: number): string {
  if (val >= 10) return `${val.toFixed(1)} AU`;
  if (val >= 1) return `${val.toFixed(2)} AU`;
  if (val >= 0.01) return `${val.toFixed(3)} AU`;
  return `${val.toFixed(5)} AU`;
}

export function formatKm(km: number): string {
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)}B km`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)}M km`;
  if (km >= 1e3) return `${Math.round(km).toLocaleString()} km`;
  return `${km.toFixed(1)} km`;
}

interface DualScaleHUDProps {
  scale: ScaleData | null;
}

export function DualScaleHUD({ scale }: DualScaleHUDProps) {
  const currentScale: ScaleData = scale ?? {
    orbitAu: 0.747,
    orbitKm: 111750000,
    planetKm: 119100,
    planetAu: 0.000796,
    ratio: 938.19,
    cameraDistance: 72.1,
    zoomFactor: 1.0,
    barWidthPx: 100,
  };

  return (
    <div className="scale-boxes-container">
      <div className="scale-box orbit-box">
        <div className="scale-box-header">
          <span className="scale-box-label">ORBIT SCALE</span>
          <span className="scale-ref-tag">100 px</span>
        </div>
        <strong className="scale-box-val">{formatAu(currentScale.orbitAu)}</strong>
        <div className="scale-mini-ruler orbit-ruler" style={{ width: `${currentScale.barWidthPx}px` }}>
          <span className="ruler-tick start" />
          <span className="ruler-line" />
          <span className="ruler-tick end" />
        </div>
        <small className="scale-box-sub">{formatKm(currentScale.orbitKm)}</small>
      </div>

      <div className="scale-box planet-box">
        <div className="scale-box-header">
          <span className="scale-box-label">PLANET SCALE</span>
          <span className="scale-ref-tag">100 px</span>
        </div>
        <strong className="scale-box-val">{formatKm(currentScale.planetKm)}</strong>
        <div className="scale-mini-ruler planet-ruler" style={{ width: `${currentScale.barWidthPx}px` }}>
          <span className="ruler-tick start" />
          <span className="ruler-line" />
          <span className="ruler-tick end" />
        </div>
        <small className="scale-box-sub">{formatAu(currentScale.planetAu)}</small>
      </div>
    </div>
  );
}
