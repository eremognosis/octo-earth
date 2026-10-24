#include "rulebook_validator.hpp"
#include <cmath>

namespace octo {
    std::uint8_t validateRulebook (const OctopusResult &r, bool propulsion_enabler_on, double delta_g) {
        std::uint8_t status = 0;
        if (!propulsion_enabler_on && std::abs (delta_g) > 1e-5 * 9.80665) status |= 1;
        if (!(r.minimum_safety_factor >= 1.5) || !std::isfinite (r.minimum_safety_factor)) status |= 2;
        if (!std::isfinite (r.maximum_current_density) || !std::isfinite (r.critical_current_density) ||
            r.maximum_current_density >= r.critical_current_density)
            status |= 4;
        return status;
    }
} // namespace octo
