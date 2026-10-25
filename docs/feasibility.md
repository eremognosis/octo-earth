# Feasibility and practical limits

## Feasible parts

The following are ordinary, testable physics or engineering calculations:

- matter-antimatter rest-mass energy (`E = mc^2`);
- Newtonian N-body gravity and Keplerian orbital elements;
- finite-radius geometry and swept collision detection;
- momentum and angular-momentum accounting;
- radiative equilibrium estimates;
- numerical convergence comparisons.

These calculations can be inspected in the C++ tests and downloaded logs.

## Non-feasible parts

The mission is not achievable with current technology because the required
energy, power handling, propulsion authority, reaction management, shielding,
and reliability exceed practical capability. Antimatter production and
containment are especially limiting. A 10,000-year habitat also requires
unavailable closed-loop ecological, maintenance, and radiation protection
systems.

## Principles the practical design would violate or exceed

The simulation does not claim to repeal conservation laws. It explicitly
records reaction force and energy. In practice, however, the enablers assume
capabilities that violate present engineering limits:

- an enormous, safely storable antimatter inventory and near-total conversion
  efficiency;
- a solar-system-scale steerable refractor/mirror swarm capable of delivering
  roughly `2.2e17 W` to Earth at 2.7 AU;
- an external momentum sink/source unavailable to an ordinary isolated Earth
  system;
- field strengths and response times capable of preventing contact between
  macroscopic bodies without destructive impulse or unacceptable tidal loads;
- structural, thermal, magnetic, and ecological protection over 10,000 years.

Thus “PASS” means “passes under the three declared assumptions and the
implemented model,” not “buildable with known hardware.”
