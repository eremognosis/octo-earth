#include <cmath>
#include <cstdlib>
#include <iostream>
#include <vector>
#include "contract.h"
#include "rulebook_validator.hpp"

int main () {
    constexpr std::size_t frames = 500'000;
    SimConfig config{2.70, 10'000.0, 1.2e7, 1.0e25, 1.5e18, OCTO_ENABLERS_ALL, frames};
    std::vector<WorldTelemetryFrame> telemetry (frames);
    run_world_simulation (&config, telemetry.data (), telemetry.size ());

    for (std::size_t i = 0; i < telemetry.size (); ++i) {
        if ((telemetry[i].status_bitmask & octo::Collision) != 0 ||
            telemetry[i].status_bitmask != 0 || !std::isfinite (telemetry[i].minimum_separation_au) ||
            telemetry[i].minimum_separation_au <= 0.0) {
            std::cerr << "enabled mission/collision check failed at frame " << i << " (t=" << telemetry[i].time_y
                      << ", status=" << static_cast<unsigned> (telemetry[i].status_bitmask)
                      << ", separation=" << telemetry[i].minimum_separation_au << ")\n";
            return EXIT_FAILURE;
        }
    }

    if (std::abs (telemetry.back ().time_y - config.max_years) > 1.0e-9) {
        std::cerr << "enabled mission did not reach the requested duration\n";
        return EXIT_FAILURE;
    }
}
