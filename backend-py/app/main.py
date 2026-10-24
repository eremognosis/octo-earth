from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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


class SimulationRequest(BaseModel):
    target_au: float = Field(2.70, gt=0.0, le=100.0)
    max_years: float = Field(10000.0, gt=0.0, le=1_000_000.0)
    arm_length_m: float = Field(1.2e7, gt=0.0)
    jc_limit_a_m2: float = Field(1.0e20, gt=0.0)
    yield_strength_pa: float = Field(1.5e18, gt=0.0)
    gravity_tether_on: bool = True
    propulsion_enabler: bool = True
    structural_enabler: bool = True
    superconducting_enabler: bool = True
    frames: int = Field(10000, ge=1, le=1_000_000)

    def to_c_config(self) -> SimConfig:
        mask = (1 if self.gravity_tether_on else 0) | (2 if self.propulsion_enabler else 0)
        mask |= (4 if self.structural_enabler else 0) | (8 if self.superconducting_enabler else 0)
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
    headers = {
        "X-Octo-Frame-Bytes": str(world.dtype.itemsize),
        "X-Octo-Frame-Count": str(len(world)),
        "X-Octo-Format": "WorldTelemetryFrame-v1-little-endian",
    }
    return StreamingResponse(
        _chunks(memoryview(world).cast("B"), chunk_frames * world.dtype.itemsize),
        media_type="application/octet-stream",
        headers=headers,
    )


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
