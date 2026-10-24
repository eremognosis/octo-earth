#include <cmath>
#include <cstdlib>
#include <iostream>
#include "integrator.hpp"

namespace {
    void require (bool condition, const char *message) {
        if (!condition) {
            std::cerr << "FAIL: " << message << '\n';
            std::exit (EXIT_FAILURE);
        }
    }
} // namespace

int main () {
    using namespace octo;
    const double radius         = kAstronomicalUnitM;
    const double circular_speed = std::sqrt (kSolarMuM3S2 / radius);
    OrbitalState state{{radius, 0.0, 0.0}, {0.0, circular_speed, 0.0}};
    const double initial_energy = specificOrbitalEnergy (state);

    integrate (state, 10'000.0 * kSecondsPerYear, 24.0 * 3600.0);

    const double relative_error = std::abs ((specificOrbitalEnergy (state) - initial_energy) / initial_energy);
    std::cout << "energy relative error: " << relative_error << '\n';
    require (std::isfinite (relative_error), "energy error is finite");
    require (relative_error < 1.0e-12, "energy drift is below 1e-12 over 10,000 orbits");
    require (std::abs (norm (state.position_m) - radius) / radius < 1.0e-6, "circular orbit radius remains bounded");
}
