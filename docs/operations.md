# Running the project and reading logs

## Build and test

From the repository root:

```sh
cmake -S core-cpp -B core-cpp/build
cmake --build core-cpp/build
ctest --test-dir core-cpp/build --output-on-failure
core-cpp/build/compliance_audit compliance-logs
```

The API requires `core-cpp/build/liboctocore.so`, or an explicit
`OCTOCORE_LIB_PATH`. Docker users can run:

```sh
docker compose up --build
```

The frontend is served on port 5173 and the API on port 8000.

## Browser workflow

Enable all three enablers, choose the target and duration, and run the
simulation. **Open compliance logs** downloads
`octo-compliance-logs.zip`. The browser renders the C++ status bits and does
not reinterpret enlarged display geometry as a physical collision.

## Archive contents

| File | Meaning |
|---|---|
| `compliance_summary.txt` | Overall conditional verdict and enabler declaration |
| `enabler_requirements.csv` | Bound, enabled result, and disabled failure for each enabler |
| `validation_benchmarks.csv` | Ten benchmark records and their evidence |
| `conservation_ledger.csv` | Force/reaction, power, momentum residual, and energy residual |
| `angular_momentum.csv` | Angular momentum components and relative drift |
| `habitability.csv` | Flux, temperature, water, atmosphere, magnetic, and Moon checks |
| `convergence.csv` | Default versus half-step numerical comparison |
| `collision_check.csv` | Frame count, collision count, and minimum separation |

`PASS` in these files is conditional on the enabled assumptions. A disabled
enabler must produce the documented failure mode; that is an intentional
honesty check rather than a UI error.
