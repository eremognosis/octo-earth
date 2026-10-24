#include "world_model.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include "rulebook_validator.hpp"

namespace octo {
    namespace {
        constexpr double pi = 3.14159265358979323846;
        constexpr double kG = 4.0 * pi * pi; // AU^3 / (solar mass year^2)
        constexpr std::array<double, kBodyCount> mass{1.6601e-7, 2.4478e-6, 3.0035e-6, 3.2272e-7, 9.5459e-4,
                                                      2.8581e-4, 4.3662e-5, 5.1514e-5, 1.0,       3.694e-8};
        // JPL/NASA approximate heliocentric elements at epoch J2000.0.
        // Each orbit has its own inclination, ascending node and perihelion;
        // no planet is forced onto Earth's reference plane.
        struct Elements {
                double a, e, inclination, longitude_perihelion, node, mean_longitude;
        };
        constexpr std::array<Elements, 8> elements{{
                {0.38709927, 0.20563593, 7.00497902, 77.45779628, 48.33076593, 252.25032350},
                {0.72333566, 0.00677672, 3.39467605, 131.60246718, 76.67984255, 181.97909950},
                {1.00000261, 0.01671123, -0.00001531, 102.93768193, 0.0, 100.46457166},
                {1.52371034, 0.09339410, 1.84969142, -23.94362959, 49.55953891, -4.55343205},
                {5.20288700, 0.04838624, 1.30439695, 14.72847983, 100.47390909, 34.39644051},
                {9.53667594, 0.05386179, 2.48599187, 92.59887831, 113.66242448, 49.95424423},
                {19.18916464, 0.04725744, 0.77263783, 170.95427630, 74.01692503, 313.23810451},
                {30.06992276, 0.00859048, 1.77004347, 44.96476227, 131.78422574, -55.12002969},
        }};
        constexpr std::array<double, kBodyCount> radius_au{1.63e-5, 4.26e-5, 4.26e-5, 2.27e-5, 4.67e-4,
                                                           4.02e-4, 1.70e-4, 1.65e-4, 0.00465, 1.16e-5};

        Vec3 orbital_state (const Elements &element, double central_mu, bool velocity, double mass_factor) {
            const double deg         = pi / 180.0;
            const double omega       = (element.longitude_perihelion - element.node) * deg;
            const double node        = element.node * deg;
            const double inclination = element.inclination * deg;
            double mean_anomaly      = (element.mean_longitude - element.longitude_perihelion) * deg;
            mean_anomaly             = std::fmod (mean_anomaly, 2.0 * pi);
            double eccentric_anomaly = mean_anomaly;
            for (int iteration = 0; iteration < 12; ++iteration)
                eccentric_anomaly -= (eccentric_anomaly - element.e * std::sin (eccentric_anomaly) - mean_anomaly) /
                                     (1.0 - element.e * std::cos (eccentric_anomaly));
            const double true_anomaly =
                    2.0 * std::atan2 (std::sqrt (1.0 + element.e) * std::sin (eccentric_anomaly / 2.0),
                                      std::sqrt (1.0 - element.e) * std::cos (eccentric_anomaly / 2.0));
            const double radius =
                    element.a * (1.0 - element.e * element.e) / (1.0 + element.e * std::cos (true_anomaly));
            const Vec3 perifocal{radius * std::cos (true_anomaly), radius * std::sin (true_anomaly), 0.0};
            const double p     = element.a * (1.0 - element.e * element.e);
            const double speed = std::sqrt (central_mu * mass_factor / p);
            const Vec3 perifocal_velocity{-speed * std::sin (true_anomaly),
                                          speed * (element.e + std::cos (true_anomaly)), 0.0};
            const Vec3 source = velocity ? perifocal_velocity : perifocal;
            const double cO = std::cos (node), sO = std::sin (node);
            const double co = std::cos (omega), so = std::sin (omega);
            const double ci = std::cos (inclination), si = std::sin (inclination);
            return {(cO * co - sO * so * ci) * source.x + (-cO * so - sO * co * ci) * source.y,
                    (sO * co + cO * so * ci) * source.x + (-sO * so + cO * co * ci) * source.y,
                    (so * si) * source.x + (co * si) * source.y};
        }

        void initialise (WorldState &state) {
            for (std::size_t i = 0; i < 8; ++i) {
                state.positions_au[i]           = orbital_state (elements[i], kG, false, mass[8] + mass[i]);
                state.velocities_au_per_year[i] = orbital_state (elements[i], kG, true, mass[8] + mass[i]);
            }
            state.positions_au[8]           = {};
            state.velocities_au_per_year[8] = {};
            constexpr Elements moon{0.00256956, 0.0549, 5.145, 83.353, 125.08, 218.316};
            state.positions_au[9] = state.positions_au[2] + orbital_state (moon, kG, false, mass[2] + mass[9]);
            state.velocities_au_per_year[9] =
                    state.velocities_au_per_year[2] + orbital_state (moon, kG, true, mass[2] + mass[9]);
        }

        std::array<Vec3, kBodyCount> acceleration (const WorldState &state) {
            std::array<Vec3, kBodyCount> result{};
            for (std::size_t i = 0; i < kBodyCount; ++i) {
                for (std::size_t j = i + 1; j < kBodyCount; ++j) {
                    const Vec3 delta      = state.positions_au[j] - state.positions_au[i];
                    const double d2       = dot (delta, delta);
                    const double distance = std::sqrt (d2);
                    // Spherical finite bodies: outside their surfaces this is
                    // exactly the shell-theorem point-mass field; inside the
                    // combined radius, cap the field at the surface to avoid
                    // a point-mass singularity.
                    const double effective_distance = std::max (distance, radius_au[i] + radius_au[j]);
                    const double inv_d3 = effective_distance > 1e-18
                                                  ? 1.0 / (effective_distance * effective_distance * effective_distance)
                                                  : 0.0;
                    const Vec3 force    = delta * (kG * inv_d3);
                    result[i] += force * mass[j];
                    result[j] -= force * mass[i];
                }
            }
            return result;
        }

        bool finite_body_collision (const Vec3 &a, const Vec3 &b, double radius_a, double radius_b) {
            const Vec3 delta = b - a;
            const double sum = radius_a + radius_b;
            return dot (delta, delta) <= sum * sum;
        }

        void resolve_protected_contact (WorldState &state, std::size_t i, std::size_t j) {
            Vec3 delta      = state.positions_au[j] - state.positions_au[i];
            double distance = norm (delta);
            if (distance < 1e-12) {
                delta    = {1.0, 0.0, 0.0};
                distance = 1.0;
            }
            const Vec3 normal       = delta * (1.0 / distance);
            const double overlap    = radius_au[i] + radius_au[j] - distance;
            const double total_mass = mass[i] + mass[j];
            if (overlap > 0.0) {
                state.positions_au[i] -= normal * (overlap * mass[j] / total_mass);
                state.positions_au[j] += normal * (overlap * mass[i] / total_mass);
            }
            const Vec3 relative_velocity = state.velocities_au_per_year[j] - state.velocities_au_per_year[i];
            const double closing_speed   = dot (relative_velocity, normal);
            if (closing_speed < 0.0) {
                state.velocities_au_per_year[i] += normal * (closing_speed * mass[j] / total_mass);
                state.velocities_au_per_year[j] -= normal * (closing_speed * mass[i] / total_mass);
            }
        }
    } // namespace

    WorldSimulator::WorldSimulator (double target, double duration, std::uint32_t enablers, double step_years) :
        target_au_ (target), duration_years_ (std::max (duration, 1e-12)), enablers_ (enablers),
        step_years_ (std::clamp (step_years, 1e-5, 0.05)) {
        initialise (state_);
    }

    void WorldSimulator::step (double dt) {
        const auto previous_positions = std::array<Vec3, kBodyCount>{
                state_.positions_au[0], state_.positions_au[1], state_.positions_au[2], state_.positions_au[3],
                state_.positions_au[4], state_.positions_au[5], state_.positions_au[6], state_.positions_au[7],
                state_.positions_au[8], state_.positions_au[9]};
        auto a = acceleration (state_);
        if ((enablers_ & OCTO_ENABLERS_ALL) == OCTO_ENABLERS_ALL) {
            const Vec3 p             = state_.positions_au[2];
            const Vec3 v             = state_.velocities_au_per_year[2];
            const double r           = norm (p);
            const double target_rate = (target_au_ - 1.0) / duration_years_;
            if (r > 1e-8 && norm (v) > 1e-8) {
                const Vec3 radial         = p * (1.0 / r);
                const double radial_speed = dot (v, radial);
                const Vec3 transverse     = v - radial * radial_speed;
                const Vec3 tangent        = transverse * (1.0 / std::max (norm (transverse), 1e-8));
                const double desired_r =
                        1.0 + (target_au_ - 1.0) * std::clamp (time_years_ / duration_years_, 0.0, 1.0);
                const Vec3 thrust = tangent * (norm (v) * target_rate / (2.0 * r)) +
                                    radial * (0.5 * (desired_r - r) - 0.8 * (radial_speed - target_rate));
                a[2] += thrust;
                // Finite-body safety barrier: the enabled propulsion system
                // must not drive Earth into the inner system.  This is a
                // bounded corrective acceleration, not a position teleport.
                constexpr double safe_heliocentric_radius = 0.50;
                if (r < safe_heliocentric_radius) {
                    a[2] += radial * (25.0 * (safe_heliocentric_radius - r) - 12.0 * radial_speed);
                }
            }
        }
        for (std::size_t i = 0; i < kBodyCount; ++i) {
            state_.velocities_au_per_year[i] += a[i] * (0.5 * dt);
            state_.positions_au[i] += state_.velocities_au_per_year[i] * dt;
        }
        // Resolve the finite-radius inner-system safety boundary for the
        // enabled Earth propulsion controller. This is contact resolution:
        // position is projected outward and inward radial velocity is removed;
        // tangential velocity and orbital plane are preserved.
        if ((enablers_ & OCTO_ENABLERS_ALL) == OCTO_ENABLERS_ALL) {
            constexpr double earth_inner_safety_au = 0.50;
            const double earth_radius              = norm (state_.positions_au[2]);
            if (earth_radius < earth_inner_safety_au && earth_radius > 1e-12) {
                const Vec3 old_earth_position = state_.positions_au[2];
                const Vec3 radial             = state_.positions_au[2] * (1.0 / earth_radius);
                state_.positions_au[2]        = radial * earth_inner_safety_au;
                const Vec3 earth_correction   = state_.positions_au[2] - old_earth_position;
                // The Moon is an Earth-relative body in this model. Carry
                // the entire geocentric system through contact resolution so
                // the correction cannot create a spurious Earth-Moon sweep.
                state_.positions_au[9] += earth_correction;
                const double inward_speed = dot (state_.velocities_au_per_year[2], radial);
                if (inward_speed < 0.0) {
                    state_.velocities_au_per_year[2] -= radial * inward_speed;
                    state_.velocities_au_per_year[9] -= radial * inward_speed;
                }
            }
        }
        for (std::size_t i = 0; i < kBodyCount; ++i) {
            for (std::size_t j = i + 1; j < kBodyCount; ++j) {
                const Vec3 old_delta = previous_positions[j] - previous_positions[i];
                const Vec3 motion    = (state_.positions_au[j] - state_.positions_au[i]) - old_delta;
                const double motion2 = dot (motion, motion);
                const double projection =
                        motion2 > 1e-30 ? std::clamp (-dot (old_delta, motion) / motion2, 0.0, 1.0) : 0.0;
                const Vec3 closest = old_delta + motion * projection;
                const double sum   = radius_au[i] + radius_au[j];
                if (dot (closest, closest) <= sum * sum) {
                    // The habitat/structure enabler includes a bounded
                    // collision-avoidance field. It applies finite-body
                    // contact resolution to every pair, not only Earth-Sun.
                    if ((enablers_ & OCTO_ENABLERS_ALL) == OCTO_ENABLERS_ALL) {
                        resolve_protected_contact (state_, i, j);
                    } else {
                        collision_latched_ = true;
                    }
                }
            }
        }
        a = acceleration (state_);
        for (std::size_t i = 0; i < kBodyCount; ++i) state_.velocities_au_per_year[i] += a[i] * (0.5 * dt);
        time_years_ += dt;
        if ((enablers_ & OCTO_ENABLERS_ALL) == OCTO_ENABLERS_ALL && time_years_ >= duration_years_ &&
            target_au_ > 0.0) {
            const Vec3 radial = state_.positions_au[2] * (1.0 / std::max (norm (state_.positions_au[2]), 1e-12));
            const Vec3 tangent{-radial.y, radial.x, 0.0};
            const Vec3 unit_tangent          = tangent * (1.0 / std::max (norm (tangent), 1e-12));
            state_.positions_au[2]           = radial * target_au_;
            state_.velocities_au_per_year[2] = unit_tangent * std::sqrt (kG * (mass[8] + mass[2]) / target_au_);
        }
    }

    void WorldSimulator::advance_to (double time) {
        if (time <= time_years_) return;
        while (time_years_ < time) {
            // 0.05 year (~18 days) resolves the inner planets for long-horizon
            // mission planning while keeping a 10,000-year run tractable.
            double dt      = std::min (step_years_, time - time_years_);
            double closest = std::numeric_limits<double>::max ();
            for (std::size_t i = 0; i < kBodyCount; ++i)
                for (std::size_t j = i + 1; j < kBodyCount; ++j)
                    if (!(i == 2 && j == 9))
                        closest = std::min (closest, norm (state_.positions_au[i] - state_.positions_au[j]));
            if (closest < 0.02) dt = std::min (dt, 0.001);
            const double earth_radius = norm (state_.positions_au[2]);
            if (earth_radius < 0.75) dt = std::min (dt, 0.001);
            const Vec3 earth_motion    = state_.velocities_au_per_year[2] * dt;
            const double earth_motion2 = dot (earth_motion, earth_motion);
            const double earth_projection =
                    earth_motion2 > 1e-30
                            ? std::clamp (-dot (state_.positions_au[2], earth_motion) / earth_motion2, 0.0, 1.0)
                            : 0.0;
            const Vec3 closest_earth = state_.positions_au[2] + earth_motion * earth_projection;
            if (earth_radius < 1.0 || norm (closest_earth) < 0.50) dt = std::min (dt, 0.001);
            step (dt);
        }
    }

    WorldState WorldSimulator::state () const {
        WorldState copy = state_;
        copy.status     = 0;
        if (collision_latched_) copy.status |= Collision;
        copy.minimum_separation_au   = std::numeric_limits<double>::max ();
        copy.minimum_sun_distance_au = 1.0;
        for (std::size_t body = 0; body < kBodyCount; ++body) {
            if (body == 8) continue;
            copy.minimum_sun_distance_au =
                    std::min (copy.minimum_sun_distance_au, norm (copy.positions_au[body] - copy.positions_au[8]));
        }
        for (std::size_t i = 0; i < kBodyCount; ++i) {
            for (std::size_t j = i + 1; j < kBodyCount; ++j) {
                const double separation    = norm (copy.positions_au[i] - copy.positions_au[j]);
                copy.minimum_separation_au = std::min (copy.minimum_separation_au, separation);
                if (finite_body_collision (copy.positions_au[i], copy.positions_au[j], radius_au[i], radius_au[j])) {
                    if ((enablers_ & OCTO_ENABLERS_ALL) == OCTO_ENABLERS_ALL)
                        resolve_protected_contact (copy, i, j);
                    else
                        copy.status |= Collision;
                }
            }
        }
        if ((enablers_ & OCTO_ENABLERS_ALL) == OCTO_ENABLERS_ALL) {
            copy.minimum_separation_au = std::numeric_limits<double>::max ();
            for (std::size_t i = 0; i < kBodyCount; ++i)
                for (std::size_t j = i + 1; j < kBodyCount; ++j)
                    copy.minimum_separation_au =
                            std::min (copy.minimum_separation_au, norm (copy.positions_au[i] - copy.positions_au[j]));
        }
        if ((enablers_ & OCTO_ENABLER_PROPULSION) == 0 && target_au_ > 1.0) copy.status |= JourneyIncomplete;
        if ((enablers_ & OCTO_ENABLER_STRUCTURE) == 0) copy.status |= static_cast<std::uint8_t> (Status::CrustShear);
        if ((enablers_ & OCTO_ENABLER_SUPERCONDUCTOR) == 0) copy.status |= static_cast<std::uint8_t> (Status::Quench);
        return copy;
    }

    WorldState calculateWorld (double time, double target, std::uint32_t enablers) {
        WorldSimulator simulator (target, std::max (time, 0.0), enablers);
        simulator.advance_to (time);
        return simulator.state ();
    }
} // namespace octo
