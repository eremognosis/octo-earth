#include "world_model.hpp"
#include "rulebook_validator.hpp"
#include <cstdlib>
#include <iostream>

namespace {
void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(EXIT_FAILURE);
    }
}
}

int main() {
    using namespace octo;
    const auto enabled = WorldSimulator(2.7, 10'000.0, OCTO_ENABLERS_ALL).state();
    require(enabled.status == 0, "all three bounded enablers clear modeled gates");

    const auto no_propulsion = WorldSimulator(2.7, 10'000.0,
                                              OCTO_ENABLER_STRUCTURE | OCTO_ENABLER_SUPERCONDUCTOR).state();
    require((no_propulsion.status & JourneyIncomplete) != 0,
            "without propulsion the target journey fails");

    const auto no_structure = WorldSimulator(2.7, 10'000.0,
                                             OCTO_ENABLER_PROPULSION | OCTO_ENABLER_SUPERCONDUCTOR).state();
    require((no_structure.status & static_cast<unsigned>(Status::CrustShear)) != 0,
            "without structural material the structure fails");

    const auto no_superconductor = WorldSimulator(2.7, 10'000.0,
                                                  OCTO_ENABLER_PROPULSION | OCTO_ENABLER_STRUCTURE).state();
    require((no_superconductor.status & static_cast<unsigned>(Status::Quench)) != 0,
            "without superconducting conductor the circuit quenches");
}
