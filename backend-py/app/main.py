from __future__ import annotations

import json
import io
import zipfile
from collections.abc import AsyncIterator

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field

from app.core_loader import SimConfig, load_octocore, run_simulation, run_world_simulation

app = FastAPI(title="Octo-Earth Mission Control API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

libocto = load_octocore()
_latest_compliance: tuple[str, bytes] | None = None


class SimulationRequest(BaseModel):
    target_au: float = Field(2.70, gt=0.0, le=100.0)
    max_years: float = Field(10000.0, gt=0.0, le=1_000_000.0)
    arm_length_m: float = Field(1.2e7, gt=0.0)
    jc_limit_a_m2: float = Field(1.0e25, gt=0.0)
    yield_strength_pa: float = Field(1.5e18, gt=0.0)
    propulsion_enabler: bool = True
    structural_enabler: bool = True
    superconducting_enabler: bool = True
    frames: int = Field(10000, ge=1, le=1_000_000)

    def to_c_config(self) -> SimConfig:
        mask = (1 if self.propulsion_enabler else 0)
        mask |= (2 if self.structural_enabler else 0) | (4 if self.superconducting_enabler else 0)
        return SimConfig(
            self.target_au, self.max_years, self.arm_length_m, self.jc_limit_a_m2,
            self.yield_strength_pa, mask, self.frames,
        )


def _run(request: SimulationRequest):
    if libocto is None:
        raise HTTPException(
            status_code=503,
            detail="C++ core is unavailable; build liboctocore.so or set OCTOCORE_LIB_PATH",
        )
    try:
        return run_simulation(request.to_c_config(), request.frames, libocto)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _compliance_archive(request: SimulationRequest, world) -> bytes:
    """Create an honest, per-run audit bundle from the same world telemetry."""
    collision_frames = int((world["status_bitmask"] & 8 != 0).sum())
    minimum_separation = float(world["minimum_separation_au"].min())
    final_radius = float((world["body_pos_au"][:, 2, :] ** 2).sum(axis=1)[-1] ** 0.5)
    solar_flux = 1361.0 / max(final_radius * final_radius, 1e-30)
    temperature = (solar_flux * (1.0 - 0.306) / (4.0 * 5.670374419e-8)) ** 0.25
    enabled = request.propulsion_enabler and request.structural_enabler and request.superconducting_enabler
    overall = "ENABLER-CONDITIONAL PASS" if enabled and collision_frames == 0 else "FAIL"
    files = {
        "compliance_summary.txt": (
            "OCTO-EARTH PER-RUN COMPLIANCE AUDIT\n"
            f"OVERALL: {overall}\n"
            f"ENABLERS: {int(request.propulsion_enabler) + int(request.structural_enabler) + int(request.superconducting_enabler)}/3\n"
            f"COLLISION_FRAMES: {collision_frames}\n"
            f"MINIMUM_SEPARATION_AU: {minimum_separation:.12g}\n"
            "A CONDITIONAL result is not a claim of full rulebook compliance.\n"
        ),
        "conservation_ledger.csv": (
            "time_years,external_force_N,reaction_force_N,net_force_N,external_power_W,"
            "linear_momentum_residual_kg_m_s,energy_residual_J,status\n"
            f"0,0,0,0,0,0,0,NOT_IMPLEMENTED\n"
        ),
        "angular_momentum.csv": (
            "time_years,angular_momentum_x,angular_momentum_y,angular_momentum_z,relative_drift,status\n"
            "0,0,0,0,0,NOT_IMPLEMENTED\n"
        ),
        "habitability.csv": (
            "time_years,solar_flux_W_m2,equilibrium_temperature_K,liquid_water,atmosphere,"
            "magnetic_shielding,moon_bound,status\n"
            f"{float(world['time_years'][-1])},{solar_flux:.12g},{temperature:.12g},"
            f"UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,NOT_IMPLEMENTED\n"
        ),
        "convergence.csv": (
            "duration_years,step_h_years,step_h2_years,final_radius_h_au,final_radius_h2_au,"
            "relative_difference,status\n"
            f"{request.max_years},0.05,0.025,{final_radius:.12g},NOT_MEASURED,NOT_MEASURED,NOT_IMPLEMENTED\n"
        ),
        "collision_check.csv": (
            "frames_checked,collision_frames,minimum_separation_au,status\n"
            f"{len(world)},{collision_frames},{minimum_separation:.12g},"
            f"{'PASS' if collision_frames == 0 else 'FAIL'}\n"
        ),
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


async def _chunks(data: memoryview, chunk_bytes: int) -> AsyncIterator[bytes]:
    for offset in range(0, len(data), chunk_bytes):
        yield data[offset : offset + chunk_bytes].tobytes()


@app.get("/health")
def health() -> dict[str, bool | str]:
    return {"status": "ok", "core_loaded": libocto is not None}


@app.post("/api/simulate")
def simulate(
    request: SimulationRequest,
    chunk_frames: int = Query(256, ge=1, le=10_000),
) -> StreamingResponse:
    """Run the C++ engine and stream raw 176-byte frames as application/octet-stream."""
    telemetry = _run(request)
    chunk_bytes = chunk_frames * telemetry.dtype.itemsize
    headers = {
        "X-Octo-Frame-Bytes": str(telemetry.dtype.itemsize),
        "X-Octo-Frame-Count": str(len(telemetry)),
        "X-Octo-Format": "TelemetryFrame-v1-little-endian",
        "Content-Disposition": 'attachment; filename="octo-telemetry.bin"',
    }
    return StreamingResponse(
        _chunks(memoryview(telemetry).cast("B"), chunk_bytes),
        media_type="application/octet-stream",
        headers=headers,
    )


@app.get("/api/simulate")
def simulate_defaults(
    frames: int = Query(1000, ge=1, le=1_000_000),
    target_au: float = Query(2.70, gt=0.0, le=100.0),
    max_years: float = Query(10000.0, gt=0.0, le=1_000_000.0),
    chunk_frames: int = Query(256, ge=1, le=10_000),
) -> StreamingResponse:
    """Convenient browser/Postman GET equivalent of the JSON POST endpoint."""
    request = SimulationRequest(frames=frames, target_au=target_au, max_years=max_years)
    return simulate(request, chunk_frames)


@app.post("/api/ephemeris")
def ephemeris(
    request: SimulationRequest,
    chunk_frames: int = Query(256, ge=1, le=10_000),
) -> StreamingResponse:
    """Stream positions for Mercury through Neptune and the Moon as 272-byte frames."""
    if libocto is None:
        raise HTTPException(status_code=503, detail="C++ core is unavailable")
    try:
        world = run_world_simulation(request.to_c_config(), request.frames, libocto)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    global _latest_compliance
    _latest_compliance = (request.model_dump_json(), _compliance_archive(request, world))
    headers = {
        "X-Octo-Frame-Bytes": str(world.dtype.itemsize),
        "X-Octo-Frame-Count": str(len(world)),
        "X-Octo-Format": "WorldTelemetryFrame-v1-little-endian",
        "X-Octo-Collision-Frames": str(int((world["status_bitmask"] & 8 != 0).sum())),
    }
    return StreamingResponse(
        _chunks(memoryview(world).cast("B"), chunk_frames * world.dtype.itemsize),
        media_type="application/octet-stream",
        headers=headers,
    )


@app.post("/api/compliance-log")
def compliance_log(request: SimulationRequest) -> Response:
    """Run the same simulation and download its generated audit bundle."""
    if libocto is None:
        raise HTTPException(status_code=503, detail="C++ core is unavailable")
    try:
        request_key = request.model_dump_json()
        if _latest_compliance is not None and _latest_compliance[0] == request_key:
            archive = _latest_compliance[1]
        else:
            world = run_world_simulation(request.to_c_config(), request.frames, libocto)
            archive = _compliance_archive(request, world)
        return Response(
            content=archive,
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="octo-compliance-logs.zip"'},
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/compliance-log")
def compliance_log_download(request: SimulationRequest = Depends()) -> Response:
    """Native browser-download variant of the compliance endpoint."""
    return compliance_log(request)


@app.websocket("/ws/simulate")
async def websocket_simulate(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        request = SimulationRequest()
        # The first client message may be a JSON SimulationRequest; no message means defaults.
        try:
            message = await websocket.receive_text()
            if message:
                request = SimulationRequest.model_validate(json.loads(message))
        except (json.JSONDecodeError, ValueError) as exc:
            await websocket.send_json({"error": str(exc)})
            await websocket.close(code=1003)
            return
        telemetry = _run(request)
        view = memoryview(telemetry).cast("B")
        chunk_bytes = 256 * telemetry.dtype.itemsize
        for offset in range(0, len(view), chunk_bytes):
            await websocket.send_bytes(view[offset : offset + chunk_bytes].tobytes())
        await websocket.send_json({"complete": True, "frames": len(telemetry)})
    except WebSocketDisconnect:
        return
    except HTTPException as exc:
        await websocket.send_json({"error": exc.detail})
        await websocket.close(code=1011)
