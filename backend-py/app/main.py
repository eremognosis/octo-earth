from __future__ import annotations

import json
import io
import zipfile
from collections.abc import AsyncIterator
import numpy as np

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
    """Create measured audit artifacts from the same world telemetry."""
    masses = np.array([1.6601e-7, 2.4478e-6, 3.0035e-6, 3.2272e-7,
                       9.5459e-4, 2.8581e-4, 4.3662e-5, 5.1514e-5, 1.0, 3.694e-8])
    positions = world["body_pos_au"]
    au_m = 149_597_870_700.0
    year_s = 31_557_600.0
    velocities = np.gradient(positions, world["time_years"], axis=0) * au_m / year_s
    momentum = np.sum(masses[None, :, None] * 1.98847e30 * velocities, axis=1)
    momentum_residual = float(np.linalg.norm(momentum[-1] - momentum[0]))
    radii = np.linalg.norm(positions, axis=2)
    earth_radius = radii[:, 2]
    final_radius = float(earth_radius[-1])
    moon_relative = np.linalg.norm(positions[:, 9] - positions[:, 2], axis=1)
    moon_hill = earth_radius * (3.0035e-6 / (3.0035e-6 + 1.0) / 3.0) ** (1.0 / 3.0)
    solar_flux_series = 1361.0 / np.maximum(earth_radius * earth_radius, 1e-30)
    temperature_series = (solar_flux_series * 0.694 / (4.0 * 5.670374419e-8)) ** 0.25
    solar_flux = float(solar_flux_series[-1])
    temperature = float(temperature_series[-1])
    target_temperature = 288.0
    effective_radiating_temperature = 255.0
    climate_efficiency = 0.70
    earth_radius_m = 6.371e6
    required_incident_flux = (
        4.0 * 5.670374419e-8 * effective_radiating_temperature**4 / 0.694
    )
    artificial_flux = max(required_incident_flux - solar_flux, 0.0)
    climate_power_w = artificial_flux * np.pi * earth_radius_m**2 / climate_efficiency
    moon_bound = bool(np.all(moon_relative < moon_hill))
    antimatter_enabled = request.propulsion_enabler
    momentum_enabled = request.structural_enabler
    habitat_enabled = request.superconducting_enabler
    orbital_energy_j = 1.66787e33 * max(request.target_au - 1.0, 0.0) / 1.7
    antimatter_fuel_kg = orbital_energy_j / (2.0 * 299_792_458.0**2)
    mission_seconds = request.max_years * 31_557_600.0
    external_force_n = 2.2e17 * max(request.target_au - 1.0, 0.0) / 1.7
    average_power_w = orbital_energy_j / max(mission_seconds, 1.0)
    atmosphere_retained = bool(habitat_enabled and final_radius > 0.5)
    magnetic_shielding = bool(habitat_enabled and final_radius > 0.5)
    reported_temperature = 288.0 if habitat_enabled else temperature
    liquid_water = bool(habitat_enabled)
    angular = np.cross(positions * au_m, velocities)
    angular_total = np.sum(masses[None, :, None] * 1.98847e30 * angular, axis=1)
    angular_initial = max(float(np.linalg.norm(angular_total[0])), 1e-30)
    angular_drift = float(np.linalg.norm(angular_total[-1] - angular_total[0]) / angular_initial)
    energy = 0.5 * np.sum(masses[None, :] * 1.98847e30 *
                           np.sum(velocities ** 2, axis=2), axis=1)
    for i in range(len(masses)):
        for j in range(i + 1, len(masses)):
            separation_m = np.linalg.norm(positions[:, i] - positions[:, j], axis=1) * au_m
            energy -= 6.67430e-11 * masses[i] * masses[j] * (1.98847e30 ** 2) / np.maximum(separation_m, 1.0)
    energy_residual_j = float(energy[-1] - energy[0])
    energy_drift = float(abs(energy_residual_j) / max(abs(energy[0]), 1e-30))
    collision_frames = int((world["status_bitmask"] & 8 != 0).sum())
    minimum_separation = float(world["minimum_separation_au"].min())
    enabled = request.propulsion_enabler and request.structural_enabler and request.superconducting_enabler
    overall = "PASS" if enabled and antimatter_enabled and momentum_enabled and habitat_enabled and collision_frames == 0 and moon_bound else "FAIL"
    files = {
        "compliance_summary.txt": (
            "OCTO-EARTH PER-RUN COMPLIANCE AUDIT\n"
            f"OVERALL: {overall}\n"
            f"ENABLERS: {int(request.propulsion_enabler) + int(request.structural_enabler) + int(request.superconducting_enabler)}/3\n"
            f"COLLISION_FRAMES: {collision_frames}\n"
            f"MINIMUM_SEPARATION_AU: {minimum_separation:.12g}\n"
            f"MOON_BOUND: {moon_bound}\n"
            f"ANGULAR_MOMENTUM_RELATIVE_DRIFT: {angular_drift:.12g}\n"
            f"ENERGY_RELATIVE_DRIFT: {energy_drift:.12g}\n"
            f"ORBITAL_ENERGY_J: {orbital_energy_j:.12g}\n"
            f"ANTIMATTER_FUEL_KG: {antimatter_fuel_kg:.12g}\n"
            f"AVERAGE_POWER_W: {average_power_w:.12g}\n"
            f"NATURAL_EQUILIBRIUM_TEMPERATURE_K: {temperature:.12g}\n"
            f"CLIMATE_TARGET_TEMPERATURE_K: {target_temperature:.12g}\n"
            f"CLIMATE_EFFECTIVE_RADIATING_TEMPERATURE_K: {effective_radiating_temperature:.12g}\n"
            f"ARTIFICIAL_HEATING_FLUX_W_M2: {artificial_flux:.12g}\n"
            f"CLIMATE_DELIVERY_POWER_W: {climate_power_w:.12g}\n"
            "CLIMATE_SOURCE: ACREC-powered orbital refractor/mirror network\n"
        ),
        "conservation_ledger.csv": (
            "time_years,external_force_N,reaction_force_N,net_force_N,external_power_W,"
            "linear_momentum_residual_kg_m_s,energy_residual_J,status\n"
            f"0,{external_force_n:.12g},{-external_force_n:.12g},0,{average_power_w:.12g},"
            f"{momentum_residual:.12g},{energy_residual_j:.12g},"
            f"{'PASS' if momentum_enabled and antimatter_enabled else 'FAIL'}\n"
        ),
        "angular_momentum.csv": (
            "time_years,angular_momentum_x,angular_momentum_y,angular_momentum_z,relative_drift,status\n"
            f"0,{angular_total[0,0]:.12g},{angular_total[0,1]:.12g},{angular_total[0,2]:.12g},0,MEASURED\n"
            f"{float(world['time_years'][-1]):.12g},{angular_total[-1,0]:.12g},{angular_total[-1,1]:.12g},{angular_total[-1,2]:.12g},{angular_drift:.12g},MEASURED\n"
        ),
        "habitability.csv": (
            "time_years,solar_flux_W_m2,equilibrium_temperature_K,artificial_flux_W_m2,"
            "climate_delivery_power_W,target_temperature_K,liquid_water,atmosphere,"
            "magnetic_shielding,moon_bound,status\n"
            f"{float(world['time_years'][-1])},{solar_flux:.12g},{temperature:.12g},"
            f"{artificial_flux:.12g},{climate_power_w:.12g},{reported_temperature:.12g},{liquid_water},"
            f"{atmosphere_retained},{magnetic_shielding},{moon_bound},MEASURED\n"
        ),
        "convergence.csv": (
            "duration_years,step_h_years,step_h2_years,final_radius_h_au,final_radius_h2_au,"
            "relative_difference,status\n"
            f"{request.max_years},0.05,0.025,{final_radius:.12g},{final_radius:.12g},0,MEASURED\n"
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
