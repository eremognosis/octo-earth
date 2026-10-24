#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>
#include "contract.h"

int main (int argc, char **argv) {
    double max_time_ms = 1000.0;
    if (argc == 3 && std::string (argv[1]) == "--max-time-ms") max_time_ms = std::stod (argv[2]);

    constexpr std::size_t frames = 10'000;
    SimConfig config{2.70, 10'000.0, 1.2e7, 1.0e25, 1.5e18, OCTO_ENABLERS_ALL, frames};
    std::vector<TelemetryFrame> telemetry (frames);
    const auto start = std::chrono::steady_clock::now ();
    run_simulation (&config, telemetry.data (), telemetry.size ());
    const auto elapsed = std::chrono::duration<double, std::milli> (std::chrono::steady_clock::now () - start).count ();

    if (!std::isfinite (telemetry.back ().time_y) || telemetry.back ().time_y > config.max_years + 1.0e-9 ||
        std::abs (telemetry.back ().semi_major_axis_au - config.target_au) > 0.35 ||
        telemetry.back ().status_bitmask != 0) {
        std::cerr << "journey validation failed: t=" << telemetry.back ().time_y
                  << " a=" << telemetry.back ().semi_major_axis_au
                  << " status=" << static_cast<unsigned> (telemetry.back ().status_bitmask) << '\n';
        return EXIT_FAILURE;
    }
    std::cout << "10,000-year journey: " << elapsed << " ms, final AU: " << telemetry.back ().semi_major_axis_au
              << '\n';
    if (elapsed > max_time_ms) {
        std::cerr << "benchmark exceeded " << max_time_ms << " ms\n";
        return EXIT_FAILURE;
    }
}
