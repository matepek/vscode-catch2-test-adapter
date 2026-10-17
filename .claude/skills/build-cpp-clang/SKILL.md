---
name: build-cpp-clang
description: Build the C++ test projects in test/cpp with clang++ and coverage (CMake + Ninja), as described in test/cpp/README.md. Use when the C++ test executables need to be (re)built with clang.
---

# Build test/cpp with clang

Follows `test/cpp/README.md`. Build output goes to `test/cpp/build/clang` (generated, never edit by hand).

```bash
cd test/cpp
mkdir -p build/clang && cd build/clang
cmake ../.. -G Ninja -D USE_COVERAGE=ON -D CMAKE_CXX_COMPILER=clang++
ninja
```

- Requires `cmake`, `ninja` and `clang++` on `PATH`. If one is missing, report it instead of installing anything.
- Re-running is safe: `mkdir -p` tolerates an existing directory and `ninja` rebuilds incrementally.
- If configuration is stale or fails after a compiler change, delete `test/cpp/build/clang` and start over.
- Report the real outcome (configure errors, failing targets, or the final `ninja` summary).
