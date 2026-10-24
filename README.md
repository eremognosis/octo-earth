# Octo-Earth planetary propulsion simulation

## Build and test

```sh
cmake -S core-cpp -B core-cpp/build
cmake --build core-cpp/build
ctest --test-dir core-cpp/build --output-on-failure
core-cpp/build/compliance_audit frontend-web/public/logs
```

The C++ core is independent of the web UI. The API uses the shared library at
`core-cpp/build/liboctocore.so`; set `OCTOCORE_LIB_PATH` when it is elsewhere.

## Planet rendering

The browser scene bundles equirectangular planet and atmosphere maps from
[Solar System Scope](https://www.solarsystemscope.com/textures/), licensed
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and the Moon
color map from NASA's [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/). The
maps load locally at runtime, so the visualization does not depend on an
external image server. Required credits and source notes are in
`frontend-web/public/textures/planets/ATTRIBUTION.txt`.

## Declared hypothetical enablers

The current prototype exposes **three** bounded enablers, matching the
participant guide limit:

1. Lorentz propulsion, with the requested power/thrust envelope supplied by
   the configured propulsion model.
2. Ideal structural material, bounded by the configured yield strength.
3. Room-temperature superconducting conductors, bounded by the configured
   critical current density.

With all three enabled, the modeled gates can pass. With propulsion disabled
the target journey is marked
incomplete; with structure disabled the status is `CrustShear`; with the
superconductor disabled the status is `Quench`. No force is granted merely
because a checkbox is enabled.

## Validation status

The automated suite includes the core smoke tests, long-horizon orbit checks,
the 10,000-year enabled run, and the guide's first three electromagnetic
benchmarks (wire force, closed-loop cancellation, and long-wire field).
The local test suite passing is **not** a claim that the hackathon rulebook is
fully satisfied.

The following guide requirements remain explicit implementation limits and
must not be presented as passed in a submission: an external reaction/momentum
ledger, propulsion energy and waste-heat accounting, habitability
(temperature, water, atmosphere, and magnetic shielding), Moon-boundness
validation, all ten guide benchmarks, timestep convergence reporting,
segment-level buckling/hinge analysis, and a final target semi-major-axis
acceptance check. The UI therefore reports “internal checks pass” rather than
“10,000-year pass”.

## Separate compliance logs

Each browser simulation generates a fresh audit bundle in memory from the same
world telemetry run. The in-simulation **Open compliance logs** control
downloads it as `octo-compliance-logs.zip`; the archive contains separate CSV
files for validation benchmarks, conservation, angular momentum, habitability,
timestep convergence, and collision checking. Generated files are ignored by
Git. They contain explicit `NOT_IMPLEMENTED` or `PARTIAL` statuses where the
core has no measurement; this is deliberate scientific-honesty behavior, not a
pass claim.
