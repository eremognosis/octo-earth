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

    // Guide benchmark 1: F = I L x B = +10 N z.
    const Vec3 force = 10.0 * Vec3{2.0, 0.0, 0.0};
    const Vec3 field{0.0, 0.5, 0.0};
    const Vec3 lorentz{force.y * field.z - force.z * field.y, force.z * field.x - force.x * field.z,
                       force.x * field.y - force.y * field.x};
    require (std::abs (lorentz.x) < 1e-12 && std::abs (lorentz.y) < 1e-12 && std::abs (lorentz.z - 10.0) < 1e-9,
             "wire Lorentz force benchmark");

    // Guide benchmark 2: a closed loop in a uniform field has zero net force.
    const Vec3 loop_force = lorentz + (-lorentz);
    require (norm (loop_force) < 1e-9, "closed-loop uniform-field cancellation");

    // Guide benchmark 3: B = mu0 I / (2 pi r) for a long straight wire.
    constexpr double mu0         = 4.0 * 3.14159265358979323846e-7;
    const double long_wire_field = mu0 * 1000.0 / (2.0 * 3.14159265358979323846);
    require (std::abs (long_wire_field - 2.0e-4) < 1.0e-6, "long-wire Biot-Savart benchmark");
}
