#pragma once
#include <cstdint>
#include "contract.h"
#include "integrator.hpp"

namespace octo {
    constexpr std::size_t kBodyCount = 10;

    struct WorldState {
            Vec3 positions_au[kBodyCount]{};
            Vec3 velocities_au_per_year[kBodyCount]{};
            double minimum_separation_au{};
            double minimum_sun_distance_au{1.0};
            std::uint8_t status{};
    };

    class WorldSimulator {
        public:
            WorldSimulator (double target_au, double duration_years, std::uint32_t enablers, double step_years = 0.05);
            void advance_to (double time_years);
            WorldState state () const;

        private:
            double target_au_;
            double duration_years_;
            std::uint32_t enablers_;
            double step_years_;
            double time_years_{};
            WorldState state_{};
            bool collision_latched_{false};
            void step (double dt_years);
    };

    WorldState calculateWorld (double time_years, double target_au, std::uint32_t enablers);
} // namespace octo
