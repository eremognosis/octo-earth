#include <cmath>
#include <cstdlib>
#include <iostream>
#include "lorentz_octopus.hpp"
#include "rulebook_validator.hpp"
#include "world_model.hpp"

namespace {
    void require (bool condition, const char *message) {
        if (!condition) {
            std::cerr << "FAIL: " << message << '\n';
            std::exit (EXIT_FAILURE);
        }
    }
    octo::Vec3 cross (const octo::Vec3 &a, const octo::Vec3 &b) {
        return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
    }
} // namespace

int main () {
    using namespace octo;
    ParkerSpiral parker;
    const Vec3 one_au{kAstronomicalUnitM, 0.0, 0.0};
    const Vec3 two_au{2.0 * kAstronomicalUnitM, 0.0, 0.0};
    const double b_one = norm (parker.field (one_au).tesla);
    const double b_two = norm (parker.field (two_au).tesla);
    require (std::isfinite (b_one) && b_one > 0.0, "Parker field is finite");
    require (b_two < b_one && b_two > 0.15 * b_one, "Parker field has physical radial falloff");

    OctopusModel model;
    const auto result = model.evaluate (one_au, 0.0, 2.25e17, parker);
    require (result.arms.size () == kArmCount, "all eight arms are evaluated");
    require (norm (result.total_force) < 1.0e-6 * 2.25e17, "symmetric arms cancel in a uniform field");
    require (std::isfinite (result.minimum_safety_factor), "safety factor is finite");
    require (validateRulebook (result, true) == 0, "nominal enablers pass rulebook");

    OctopusModel unsafe                  = model;
    unsafe.critical_current_density_a_m2 = 1.0;
    const auto unsafe_result             = unsafe.evaluate (one_au, 0.0, 2.25e17, parker);
    require ((validateRulebook (unsafe_result, true) & 4U) != 0, "over-current condition raises quench status");

    WorldSimulator world (2.7, 10000.0, OCTO_ENABLERS_ALL);
    world.advance_to (25.0);
    const auto snapshot = world.state ();
    require (std::abs (snapshot.positions_au[0].z) > 1.0e-6 || std::abs (snapshot.positions_au[1].z) > 1.0e-6,
             "inclined planetary orbits produce non-zero z motion");
    const auto mercury_normal   = cross (snapshot.positions_au[0], snapshot.velocities_au_per_year[0]);
    const auto venus_normal     = cross (snapshot.positions_au[1], snapshot.velocities_au_per_year[1]);
    const auto plane_difference = cross (mercury_normal, venus_normal);
    require (norm (plane_difference) > 1.0e-4, "NASA orbital elements preserve distinct planetary orbital planes");
    require (snapshot.minimum_separation_au > 0.0, "minimum separation is calculated");
}
