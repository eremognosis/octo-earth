import ctypes
import os
from pathlib import Path
from typing import Any

import numpy as np

TELEMETRY_DTYPE = np.dtype([
    ("time_years", np.float64),
    ("earth_pos_au", np.float64, (3,)),
    ("earth_vel_kms", np.float64, (3,)),
    ("semi_major_axis_au", np.float64),
    ("eccentricity", np.float64),
    ("arm_currents_ea", np.float64, (8,)),
    ("arm_hinge_rad", np.float32, (8,)),
    ("min_safety_factor", np.float32),
    ("status_bitmask", np.uint8),
    ("padding", np.uint8, (3,)),
], align=False)
WORLD_DTYPE = np.dtype([
    ("time_years", np.float64),
    ("body_pos_au", np.float64, (10, 3)),
    ("minimum_separation_au", np.float64),
    ("minimum_sun_distance_au", np.float64),
    ("status_bitmask", np.uint8),
    ("padding", np.uint8, (7,)),
], align=False)

if TELEMETRY_DTYPE.itemsize != 176:
    raise RuntimeError(f"Telemetry ABI mismatch: NumPy dtype is {TELEMETRY_DTYPE.itemsize} bytes")
if WORLD_DTYPE.itemsize != 272:
    raise RuntimeError(f"World ABI mismatch: NumPy dtype is {WORLD_DTYPE.itemsize} bytes")

class SimConfig(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("target_au", ctypes.c_double),
        ("max_years", ctypes.c_double),
        ("arm_length_m", ctypes.c_double),
        ("jc_limit_a_m2", ctypes.c_double),
        ("yield_strength_pa", ctypes.c_double),
        ("enablers", ctypes.c_uint32),
        ("num_output_frames", ctypes.c_uint32),
    ]

    @classmethod
    def defaults(cls, frames: int = 10000) -> "SimConfig":
        return cls(2.70, 10000.0, 1.2e7, 1.0e25, 1.5e18, 7, frames)


def load_octocore() -> Any:
    # Search common build paths
    candidates = [
        os.environ.get("OCTOCORE_LIB_PATH", ""),
        str(Path(__file__).resolve().parents[2] / "core-cpp/build/liboctocore.so"),
        str(Path(__file__).resolve().parents[2] / "core-cpp/build/Release/octocore.dll"),
        "./liboctocore.so",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            lib = ctypes.CDLL(path)
            lib.run_simulation.argtypes = [
                ctypes.POINTER(SimConfig),
                ctypes.c_void_p,
                ctypes.c_size_t,
            ]
            lib.run_simulation.restype = None
            lib.run_world_simulation.argtypes = [
                ctypes.POINTER(SimConfig),
                ctypes.c_void_p,
                ctypes.c_size_t,
            ]
            lib.run_world_simulation.restype = None
            return lib
    return None


def run_simulation(config: SimConfig, frames: int, library: Any = None) -> np.ndarray:
    """Run the C ABI directly into a contiguous NumPy buffer (one copy at most on send)."""
    if frames < 1 or frames > 1_000_000:
        raise ValueError("frames must be between 1 and 1,000,000")
    if library is None:
        library = load_octocore()
    if library is None:
        raise RuntimeError("liboctocore.so is not available; set OCTOCORE_LIB_PATH")
    config.num_output_frames = frames
    buffer = np.empty(frames, dtype=TELEMETRY_DTYPE)
    library.run_simulation(
        ctypes.byref(config),
        ctypes.c_void_p(buffer.ctypes.data),
        ctypes.c_size_t(frames),
    )
    return buffer


def run_world_simulation(config: SimConfig, frames: int, library: Any = None) -> np.ndarray:
    if frames < 1 or frames > 1_000_000:
        raise ValueError("frames must be between 1 and 1,000,000")
    if library is None:
        library = load_octocore()
    if library is None:
        raise RuntimeError("liboctocore.so is not available; set OCTOCORE_LIB_PATH")
    config.num_output_frames = frames
    buffer = np.empty(frames, dtype=WORLD_DTYPE)
    library.run_world_simulation(
        ctypes.byref(config), ctypes.c_void_p(buffer.ctypes.data), ctypes.c_size_t(frames)
    )
    return buffer