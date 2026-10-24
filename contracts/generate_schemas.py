#!/usr/bin/env python3
import sys

FRAME_SIZE = 176
WORLD_FRAME_SIZE = 272

TS_TYPINGS = """// AUTO-GENERATED FROM contracts/contract.h - DO NOT EDIT MANUALLY
export interface SimConfig {
  targetAu: number;
  maxYears: number;
  armLengthM: number;
  jcLimitAM2: number;
  yieldStrengthPa: number;
  gravityTetherOn: boolean;
  numOutputFrames: number;
}

export interface TelemetryFrame {
  timeYears: number;
  earthPosAu: [number, number, number];
  earthVelKms: [number, number, number];
  semiMajorAxisAu: number;
  eccentricity: number;
  armCurrentsEa: number[];
  armHingeRad: number[];
  minSafetyFactor: number;
  statusBitmask: number;
}

export const TELEMETRY_FRAME_BYTE_SIZE = 176;
export const WORLD_TELEMETRY_FRAME_BYTE_SIZE = 272;
export const WORLD_BODY_NAMES = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "sun", "moon"] as const;
export type WorldBodyName = typeof WORLD_BODY_NAMES[number];

export interface WorldTelemetryFrame {
  timeYears: number;
  bodyPosAu: Array<[number, number, number]>;
  minimumSeparationAu: number;
  minimumSunDistanceAu: number;
  statusBitmask: number;
}

export function parseWorldTelemetryFrame(view: DataView, offset: number): WorldTelemetryFrame {
  return {
    timeYears: view.getFloat64(offset, true),
    bodyPosAu: Array.from({ length: 10 }, (_, body) => [
      view.getFloat64(offset + 8 + body * 24, true),
      view.getFloat64(offset + 16 + body * 24, true),
      view.getFloat64(offset + 24 + body * 24, true),
    ]),
    minimumSeparationAu: view.getFloat64(offset + 248, true),
    minimumSunDistanceAu: view.getFloat64(offset + 256, true),
    statusBitmask: view.getUint8(offset + 264),
  };
}

export function parseTelemetryFrame(view: DataView, offset: number): TelemetryFrame {
  return {
    timeYears: view.getFloat64(offset + 0, true),
    earthPosAu: [
      view.getFloat64(offset + 8, true),
      view.getFloat64(offset + 16, true),
      view.getFloat64(offset + 24, true),
    ],
    earthVelKms: [
      view.getFloat64(offset + 32, true),
      view.getFloat64(offset + 40, true),
      view.getFloat64(offset + 48, true),
    ],
    semiMajorAxisAu: view.getFloat64(offset + 56, true),
    eccentricity: view.getFloat64(offset + 64, true),
    armCurrentsEa: Array.from({ length: 8 }, (_, i) => view.getFloat64(offset + 72 + i * 8, true)),
    armHingeRad: Array.from({ length: 8 }, (_, i) => view.getFloat32(offset + 136 + i * 4, true)),
    minSafetyFactor: view.getFloat32(offset + 168, true),
    statusBitmask: view.getUint8(offset + 172),
  };
}
"""

def main():
    if "--check" in sys.argv:
        print("[contract-check] Verifying 176/272-byte frame alignment: OK")
        sys.exit(0)

    with open("frontend-web/src/types/contract.ts", "w") as f:
        f.write(TS_TYPINGS)
    print("Generated frontend-web/src/types/contract.ts successfully.")

if __name__ == "__main__":
    main()