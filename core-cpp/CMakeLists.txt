cmake_minimum_required(VERSION 3.20)
project(octocore VERSION 0.1.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)



add_compile_options(-O3 -ffast-math -Wall -Wextra)

add_library(octocore SHARED
        src/c_api_bridge.cpp
        src/integrator.cpp
        src/lorentz_octopus.cpp
        src/rulebook_validator.cpp
        src/world_model.cpp
)

target_include_directories(octocore PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/../contracts>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
)

enable_testing()
add_executable(test_sanity
        tests/test.cpp)
target_link_libraries(test_sanity PRIVATE octocore)
add_test(NAME test_sanity COMMAND test_sanity)

add_executable(test_energy_conservation tests/test_energy_conservation.cpp)
target_link_libraries(test_energy_conservation PRIVATE octocore)
add_test(NAME test_energy_conservation COMMAND test_energy_conservation)

add_executable(test_physics tests/test_physics.cpp)
target_link_libraries(test_physics PRIVATE octocore)
add_test(NAME test_physics COMMAND test_physics)

add_executable(bench_10k_years tests/bench_10k_years.cpp)
target_link_libraries(bench_10k_years PRIVATE octocore)
add_test(NAME bench_10k_years COMMAND bench_10k_years)

add_executable(test_enabled_mission tests/test_enabled_mission.cpp)
target_link_libraries(test_enabled_mission PRIVATE octocore)
add_test(NAME test_enabled_mission COMMAND test_enabled_mission)

add_executable(test_lorentz_benchmarks tests/test_lorentz_benchmarks.cpp)
target_link_libraries(test_lorentz_benchmarks PRIVATE octocore)
add_test(NAME test_lorentz_benchmarks COMMAND test_lorentz_benchmarks)

add_executable(test_enabler_gate tests/test_enabler_gate.cpp)
target_link_libraries(test_enabler_gate PRIVATE octocore)
add_test(NAME test_enabler_gate COMMAND test_enabler_gate)

add_executable(compliance_audit tests/compliance_audit.cpp)
target_link_libraries(compliance_audit PRIVATE octocore)