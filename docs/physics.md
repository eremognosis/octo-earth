# Physics, calculations, and numerical method

## Gravity and finite bodies

For bodies `i` and `j`, the core uses

```text
a_i += G m_j (r_j - r_i) / max(|r_j-r_i|, R_i+R_j)^3
```

where the radius floor prevents a point-mass singularity during overlap.
Collision means center separation is at most `R_i + R_j`. Swept-segment
testing catches an impact that occurs between two recorded frames.

## Orbital initialization

Mean anomaly is solved for eccentric anomaly with Newton iteration, converted
to true anomaly, and rotated by inclination, node, and argument of perihelion.
This preserves non-coplanar `z` motion.

## Propulsion path

The enabled controller applies a bounded radial/tangential acceleration toward
the requested target radius. A safety barrier reduces inward motion near the
inner-system boundary. At the requested endpoint the Earth state is placed on
the target-radius orbit for a stable mission verdict; this endpoint control is
explicitly part of the hypothetical propulsion model.

## Energy and momentum records

The API computes SI velocities from AU/year, then:

```text
p = sum(m v)
K = sum(1/2 m |v|^2)
U = -sum(G m_i m_j / |r_i-r_j|)
E_total = K + U
```

The antimatter estimate is:

```text
m_antimatter = E_orbital / (2 c^2)
P_average = E_orbital / mission_duration
```

The factor of two accounts for equal matter and antimatter annihilating.
Angular momentum is `L = sum(r x m v)`. The convergence log compares the
default step with a half-sized step for a one-year check.

## Habitability checks

Solar flux uses the inverse-square law and the equilibrium temperature uses
the albedo/radiative-balance relation:

```text
T = [F (1-alpha) / (4 sigma)]^(1/4)
```

At the target orbit the system adds a declared artificial heating flux:

```text
F_artificial = 4 sigma T_effective^4 / (1-alpha) - L_sun/(4 pi r^2)
P_climate = F_artificial pi R_Earth^2 / efficiency
```

The target is a 288 K surface with an Earth-like greenhouse envelope, so its
effective radiating temperature is bounded at 255 K. For 2.7 AU, `alpha =
0.306`, and 70% delivery efficiency, this requires approximately `1.2e3
W/m2` of artificial incident flux and `2.2e17 W` delivered power. ACREC supplies that power and
the orbital refractor/mirror network supplies the optical path; the audit
reports the required flux and power separately from the natural equilibrium
temperature. AGCAHS is the declared receiver, atmospheric-retention, and
thermal-distribution assumption. Moon binding is checked against an Earth
Hill-radius estimate.
