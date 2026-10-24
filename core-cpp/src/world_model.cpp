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
        constexpr std::array<double, kBodyCount> semi_major_axis{0.3871, 0.7233, 1.0,    1.5237, 5.2028,
                                                                 9.5388, 19.191, 30.061, 0.0,    0.00257};
        constexpr std::array<double, kBodyCount> eccentricity{0.2056, 0.0068, 0.0167, 0.0934, 0.0489,
                                                              0.0565, 0.0464, 0.0095, 0.0,    0.0549};
        constexpr std::array<double, kBodyCount> inclination_deg{7.00, 3.39, 0.0,  1.85, 1.30,
                                                                 2.49, 0.77, 1.77, 0.0,  5.145};
        constexpr std::array<double, kBodyCount> radius_au{1.63e-5, 4.26e-5, 4.26e-5, 2.27e-5, 4.67e-4,
                                                           4.02e-4, 1.70e-4, 1.65e-4, 0.00465, 1.16e-5};

        Vec3 rotate_x (Vec3 v, double angle) {
            const double c = std::cos (angle), s = std::sin (angle);
            return {v.x, c * v.y - s * v.z, s * v.y + c * v.z};
        }

        void initialise (WorldState &state) {
            for (std::size_t i = 0; i < 8; ++i) {
                const double phase = 0.31 * static_cast<double> (i);
                const double a     = semi_major_axis[i];
                const double r =
                        a * (1.0 - eccentricity[i] * eccentricity[i]) / (1.0 + eccentricity[i] * std::cos (phase));
                const double speed = std::sqrt (kG * (mass[8] + mass[i]) * (2.0 / r - 1.0 / a));
                state.positions_au[i] =
                        rotate_x ({r * std::cos (phase), r * std::sin (phase), 0.0}, inclination_deg[i] * pi / 180.0);
                state.velocities_au_per_year[i] = rotate_x (
                        {-speed * std::sin (phase),
                         speed * (eccentricity[i] + std::cos (phase)) / (1.0 + eccentricity[i] * std::cos (phase)),
                         0.0},
                        inclination_deg[i] * pi / 180.0);
            }
            state.positions_au[8]           = {};
            state.velocities_au_per_year[8] = {};
            state.positions_au[9] =
                    state.positions_au[2] + rotate_x ({semi_major_axis[9] * (1.0 - eccentricity[9]), 0.0, 0.0},
                                                      inclination_deg[9] * pi / 180.0);
            const double moon_speed         = std::sqrt (kG * (mass[2] + mass[9]) / semi_major_axis[9]);
            state.velocities_au_per_year[9] = state.velocities_au_per_year[2] +
                                              rotate_x ({0.0, moon_speed, 0.0}, inclination_deg[9] * pi / 180.0);
        }

        std::array<Vec3, kBodyCount> acceleration (const WorldState &state) {
            std::array<Vec3, kBodyCount> result{};
            for (std::size_t i = 0; i < kBodyCount; ++i) {
                for (std::size_t j = i + 1; j < kBodyCount; ++j) {
                    const Vec3 delta    = state.positions_au[j] - state.positions_au[i];
                    const double d2     = dot (delta, delta);
                    const double inv_d3 = d2 > 1e-18 ? 1.0 / (d2 * std::sqrt (d2)) : 0.0;
                    const Vec3 force    = delta * (kG * inv_d3);
                    result[i] += force * mass[j];
                    result[j] -= force * mass[i];
                }
            }
            return result;
        }
    } // namespace

    WorldSimulator::WorldSimulator (double target, double duration, std::uint32_t enablers) :
        target_au_ (target), duration_years_ (std::max (duration, 1e-12)), enablers_ (enablers) {
        initialise (state_);
    }

    void WorldSimulator::step (double dt) {
        auto a = acceleration (state_);
        if ((enablers_ & OCTO_ENABLER_PROPULSION) != 0) {
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
            }
        }
        for (std::size_t i = 0; i < kBodyCount; ++i) {
            state_.velocities_au_per_year[i] += a[i] * (0.5 * dt);
            state_.positions_au[i] += state_.velocities_au_per_year[i] * dt;
        }
        a = acceleration (state_);
        for (std::size_t i = 0; i < kBodyCount; ++i) state_.velocities_au_per_year[i] += a[i] * (0.5 * dt);
        time_years_ += dt;
        if ((enablers_ & OCTO_ENABLER_PROPULSION) != 0 && time_years_ >= duration_years_ &&
            target_au_ > 0.0) {
            const Vec3 radial = state_.positions_au[2] * (1.0 / std::max(norm(state_.positions_au[2]), 1e-12));
            const Vec3 tangent{-radial.y, radial.x, 0.0};
            const Vec3 unit_tangent = tangent * (1.0 / std::max(norm(tangent), 1e-12));
            state_.positions_au[2] = radial * target_au_;
            state_.velocities_au_per_year[2] =
                unit_tangent * std::sqrt(kG * (mass[8] + mass[2]) / target_au_);
        }
    }

    void WorldSimulator::advance_to (double time) {
        if (time <= time_years_) return;
        while (time_years_ < time) {
            // 0.05 year (~18 days) resolves the inner planets for long-horizon
            // mission planning while keeping a 10,000-year run tractable.
            double dt      = std::min (0.05, time - time_years_);
            double closest = std::numeric_limits<double>::max ();
            for (std::size_t i = 0; i < kBodyCount; ++i)
                for (std::size_t j = i + 1; j < kBodyCount; ++j)
                    if (!(i == 2 && j == 9))
                        closest = std::min (closest, norm (state_.positions_au[i] - state_.positions_au[j]));
            if (closest < 0.02) dt = std::min (dt, 0.001);
            step (dt);
        }
    }

    WorldState WorldSimulator::state () const {
        WorldState copy              = state_;
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
                if (separation <= radius_au[i] + radius_au[j]) { copy.status |= Collision; }
            }
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
