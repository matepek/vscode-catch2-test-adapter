#include <benchmark/benchmark.h>

#include <chrono>
#include <thread>

///

static void BM_StringCreation(benchmark::State& state) {
  for (auto _ : state)
    std::string empty_string;
}
// Register the function as a benchmark
BENCHMARK(BM_StringCreation);


// Define another benchmark
static void BM_StringCopy(benchmark::State& state) {
  std::string x = "hello";
  for (auto _ : state)
    std::string copy(x);
}
BENCHMARK(BM_StringCopy);


// static void LongOne(benchmark::State& state) {
//   //std::this_thread::sleep_for(std::chrono::milliseconds(1));
// }
// BENCHMARK(LongOne);


BENCHMARK_MAIN();