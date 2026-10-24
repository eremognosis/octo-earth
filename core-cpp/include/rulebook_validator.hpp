#pragma once

#include <cstdint>
#include "lorentz_octopus.hpp"

namespace octo {

    enum class Status : std::uint8_t { Ok = 0, CrustShear = 1, ArmSnap = 2, Quench = 4 };
    constexpr std::uint8_t Collision         = 8;
    constexpr std::uint8_t LifeCompromised   = 16;
    constexpr std::uint8_t JourneyIncomplete = 32;

    std::uint8_t validateRulebook (const OctopusResult &result, bool propulsion_enabler_on,
                                   double surface_delta_g = 0.0);

} // namespace octo
