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

The enabled habitat assumption supplies the declared atmosphere, magnetic,
water, and thermal protection envelope; Moon binding is checked against an
Earth Hill-radius estimate.
