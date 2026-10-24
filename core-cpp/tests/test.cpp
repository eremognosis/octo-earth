//
// Created by raj on 10/24/26.
//

#include <cassert>
#include <iostream>
#include <vector>
#include "contract.h"
using namespace std;

int main () {
    static_assert (sizeof (TelemetryFrame) == 176, "Size");
    SimConfig cfg{};
    cfg.target_au         = 2.70;
    cfg.max_years         = 10000.0;
    cfg.yield_strength_pa = 1.5e18;
    cfg.enablers = OCTO_ENABLERS_ALL;
    cfg.num_output_frames = 100;


    vector<TelemetryFrame> buffer (100);
    run_simulation (&cfg, buffer.data (), buffer.size ());
    assert (buffer[0].semi_major_axis_au == 1.0);
    return 0;
}
