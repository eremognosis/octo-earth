#ifndef OCTO_CONTRACT_H
#define OCTO_CONTRACT_H


#include <stddef.h>
#include <stdint.h>


#pragma pack(push, 1)

#ifdef __cplusplus

extern "C" {
#endif

typedef struct {
        double target_au;
        double max_years;
        double arm_length_m;
        double jc_limit_a_m2;
        double yield_strength_pa;
        uint32_t enablers;          // exactly three permitted bits
        uint32_t num_output_frames; // no of frames

} SimConfig;

enum {
    // Three declared hypothetical assumptions, bounded in the audit:
    // ACREC, NMEVA, and AGCAHS.
    OCTO_ENABLER_ANTIMATTER        = 1u,
    OCTO_ENABLER_MOMENTUM_EXCHANGE = 2u,
    OCTO_ENABLER_HABITAT_SHIELD    = 4u,
    // ABI-compatible names used by older clients.
    OCTO_ENABLER_PROPULSION     = OCTO_ENABLER_ANTIMATTER,
    OCTO_ENABLER_STRUCTURE      = OCTO_ENABLER_MOMENTUM_EXCHANGE,
    OCTO_ENABLER_SUPERCONDUCTOR = OCTO_ENABLER_HABITAT_SHIELD,
    OCTO_ENABLERS_ALL           = OCTO_ENABLER_PROPULSION | OCTO_ENABLER_STRUCTURE | OCTO_ENABLER_SUPERCONDUCTOR
};

typedef struct {
        double time_y;
        double earth_pos_au[3]; // x, y, z in AU
        double earth_vel_km[3]; // vx, vy, vz
        double semi_major_axis_au;
        double ecc;
        double arm_current_ea[8]; // current in per ARM
        float arm_hinge_rad[8];
        float min_safety_factor; // 0 = OK, 1 = crust, 2= snap, 4 =Q
        uint8_t status_bitmask;
        unsigned char padding[3];
} TelemetryFrame;

typedef struct {
        double time_y;
        double body_pos_au[10][3]; // Mercury..Neptune, Moon is geocentric
        double minimum_separation_au;
        double minimum_sun_distance_au;
        uint8_t status_bitmask;
        unsigned char padding[7];
} WorldTelemetryFrame;

#pragma pack(pop)

#ifdef __cplusplus
static_assert (sizeof (SimConfig) == 48, "SimConfig ABI must be 48 bytes");
static_assert (sizeof (TelemetryFrame) == 176, "TelemetryFrame ABI must be 176 bytes");
static_assert (sizeof (WorldTelemetryFrame) == 272, "WorldTelemetryFrame ABI must be 272 bytes");
#endif
#define OCTO_EXPORT __attribute__ ((visibility ("default")))
OCTO_EXPORT void run_simulation (const SimConfig *config, TelemetryFrame *out_frames, size_t max_frames);
OCTO_EXPORT void run_world_simulation (const SimConfig *config, WorldTelemetryFrame *out_frames, size_t max_frames);

#ifdef __cplusplus
}
#endif

#endif
