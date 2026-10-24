#include <algorithm>
#include <cmath>
#include <cstddef>
#include "contract.h"
#include "integrator.hpp"
#include "lorentz_octopus.hpp"
#include "rulebook_validator.hpp"
#include "world_model.hpp"

namespace {
    constexpr double kPi = 3.14159265358979323846;
}

extern "C" OCTO_EXPORT void run_simulation (const SimConfig *config, TelemetryFrame *out_frames, size_t max_frames) {
    if (config == nullptr || out_frames == nullptr || max_frames == 0) return;
    const double target = (std::isfinite (config->target_au) && config->target_au > 0.0) ? config->target_au : 2.7;
    const double years  = (std::isfinite (config->max_years) && config->max_years > 0.0) ? config->max_years : 10000.0;
    const double arm_length =
            (std::isfinite (config->arm_length_m) && config->arm_length_m > 0.0) ? config->arm_length_m : 1.2e7;
    const double jc =
            (std::isfinite (config->jc_limit_a_m2) && config->jc_limit_a_m2 > 0.0) ? config->jc_limit_a_m2 : 1.0e20;
    const double yield      = (std::isfinite (config->yield_strength_pa) && config->yield_strength_pa > 0.0)
                                      ? config->yield_strength_pa
                                      : 1.5e18;
    const double duration   = years * octo::kSecondsPerYear;
    const uint32_t enablers = config->gravity_tether_on == OCTO_ENABLER_GRAVITY_TETHER
                                      ? static_cast<uint32_t> (OCTO_ENABLERS_ALL)
                                      : config->gravity_tether_on;
    const double delta_e    = octo::kSolarMuM3S2 * 5.972e24 / (2.0 * octo::kAstronomicalUnitM) * (1.0 - 1.0 / target);
    const double average_speed = 23'500.0;
    const double thrust        = duration > 0.0 ? delta_e / duration / average_speed : 0.0;

    octo::OctopusModel model;
    model.arm_length_m                  = arm_length;
    model.critical_current_density_a_m2 = (enablers & OCTO_ENABLER_SUPERCONDUCTOR) != 0 ? jc : 0.0;
    model.yield_strength_pa             = (enablers & OCTO_ENABLER_STRUCTURE) != 0 ? yield : 0.0;
    octo::WorldSimulator world_simulator (target, years, enablers);
    for (size_t i = 0; i < max_frames; ++i) {
        const double progress = max_frames == 1 ? 0.0 : static_cast<double> (i) / static_cast<double> (max_frames - 1);
        world_simulator.advance_to (progress * years);
        const auto world         = world_simulator.state ();
        const octo::Vec3 p       = world.positions_au[2] * octo::kAstronomicalUnitM;
        const octo::Vec3 v       = world.velocities_au_per_year[2] * (octo::kAstronomicalUnitM / octo::kSecondsPerYear);
        const double radius_au   = octo::norm (world.positions_au[2]);
        const auto result        = model.evaluate (p, progress * duration, thrust);
        auto &frame              = out_frames[i];
        frame.time_y             = progress * years;
        frame.earth_pos_au[0]    = p.x / octo::kAstronomicalUnitM;
        frame.earth_pos_au[1]    = p.y / octo::kAstronomicalUnitM;
        frame.earth_pos_au[2]    = p.z / octo::kAstronomicalUnitM;
        frame.earth_vel_km[0]    = v.x / 1000.0;
        frame.earth_vel_km[1]    = v.y / 1000.0;
        frame.earth_vel_km[2]    = v.z / 1000.0;
        frame.semi_major_axis_au = radius_au;
        frame.ecc                = 0.0167 * (1.0 - 0.5 * progress);
        for (size_t k = 0; k < octo::kArmCount; ++k) {
            frame.arm_current_ea[k] = result.arms[k].current_exa_amp;
            frame.arm_hinge_rad[k]  = static_cast<float> (result.arms[k].hinge_angle_rad);
        }
        frame.min_safety_factor = static_cast<float> (result.minimum_safety_factor);
        frame.status_bitmask    = octo::validateRulebook (result, (enablers & OCTO_ENABLER_GRAVITY_TETHER) != 0, 0.0);
        frame.status_bitmask    = static_cast<uint8_t> (frame.status_bitmask | world.status);
        frame.padding[0] = frame.padding[1] = frame.padding[2] = 0;
    }
}

extern "C" OCTO_EXPORT void run_world_simulation (const SimConfig *config, WorldTelemetryFrame *out_frames,
                                                  size_t max_frames) {
    if (config == nullptr || out_frames == nullptr || max_frames == 0) return;
    const double years  = std::isfinite (config->max_years) && config->max_years > 0.0 ? config->max_years : 10000.0;
    const double target = std::isfinite (config->target_au) && config->target_au > 0.0 ? config->target_au : 2.7;
    const uint32_t enablers = config->gravity_tether_on == OCTO_ENABLER_GRAVITY_TETHER
                                      ? static_cast<uint32_t> (OCTO_ENABLERS_ALL)
                                      : config->gravity_tether_on;
    octo::WorldSimulator world_simulator (target, years, enablers);
    for (size_t i = 0; i < max_frames; ++i) {
        const double progress = max_frames == 1 ? 0.0 : static_cast<double> (i) / static_cast<double> (max_frames - 1);
        world_simulator.advance_to (progress * years);
        const auto world = world_simulator.state ();
        auto &frame      = out_frames[i];
        frame.time_y     = progress * years;
        for (size_t body = 0; body < octo::kBodyCount; ++body) {
            frame.body_pos_au[body][0] = world.positions_au[body].x;
            frame.body_pos_au[body][1] = world.positions_au[body].y;
            frame.body_pos_au[body][2] = world.positions_au[body].z;
        }
        frame.minimum_separation_au = world.minimum_separation_au;
        frame.minimum_sun_distance_au = world.minimum_sun_distance_au;
        frame.status_bitmask        = world.status;
        for (auto &byte: frame.padding) byte = 0;
    }
}
