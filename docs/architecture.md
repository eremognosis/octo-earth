# Initial conditions and architecture

## System boundary

The C++ core models ten finite-radius bodies: Mercury, Venus, Earth, Mars,
Jupiter, Saturn, Uranus, Neptune, the Sun, and the Moon. The browser consumes
packed telemetry from the same core; it does not independently decide whether
a collision occurred.

Positions are in AU, velocities in AU/year, masses in solar masses, and time
in Julian years. The API and audit layer convert derived momentum and energy
values to SI units where their CSV headers specify SI units.

## Initial state

Planetary states use approximate NASA/JPL J2000 orbital elements: semi-major
axis, eccentricity, inclination, ascending node, longitude of perihelion, and
mean longitude. Each orbit is therefore initialized in its own plane. The Moon
is initialized on an inclined Earth-relative orbit. These are approximate
epoch elements, not a modern high-precision ephemeris.

## Data flow

1. `WorldSimulator` initializes the 10-body state.
2. A velocity-Verlet-style step evaluates mutual gravity and, when enabled,
   the bounded propulsion and protection terms.
3. Finite radii are checked both at frame endpoints and along swept segments.
4. The C ABI emits status bits and body positions.
5. The Python API creates the browser stream and a downloadable audit ZIP.
6. The frontend renders positions and displays the authoritative status.

The visualization enlarges bodies and distances for readability. That display
scaling never participates in collision detection.
