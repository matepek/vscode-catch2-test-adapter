#include "catch2/catch.hpp"

SCENARIO("vectors can be sized and resized", "[vector]") {
  GIVEN("A vector with some items") {
    std::vector<int> v(5);

    REQUIRE(v.size() == 5);
    REQUIRE(v.capacity() >= 5);

    WHEN("the size is increased") {
      v.resize(10);

      THEN("the size and capacity change") {
        REQUIRE(v.size() == 10);
        REQUIRE(v.capacity() >= 10);
      }
    }
    WHEN("the size is reduced") {
      v.resize(0);

      THEN("the size changes but not capacity") {
        REQUIRE(v.size() == 0);
        REQUIRE(v.capacity() >= 5);
      }
    }
    WHEN("more capacity is reserved") {
      v.reserve(10);

      THEN("the capacity changes but not the size") {
        REQUIRE(v.size() == 5);
        REQUIRE(v.capacity() < 10);  // err
      }
    }
    WHEN("less capacity is reserved") {
      v.reserve(0);

      THEN("neither size nor capacity are changed") {
        REQUIRE(v.size() == 5);
        REQUIRE(v.capacity() >= 5);
      }
    }
    AND_GIVEN("something else") {
      THEN("neither size nor capacity are changed") {
        REQUIRE(v.size() == 5);
        REQUIRE(v.capacity() < 5);  // err
      }
    }
  }
}

///

#include <map>

#if defined(CATCH_CONFIG_ENABLE_BENCHMARKING)
namespace {
std::uint64_t Fibonacci(std::uint64_t number) {
  return number < 2 ? 1 : Fibonacci(number - 1) + Fibonacci(number - 2);
}
}  // namespace

TEST_CASE("Benchmark Fibonacci", "[!benchmark]") {
  CHECK(Fibonacci(0) == 1);
  // some more asserts..
  CHECK(Fibonacci(5) == 8);
  // some more asserts..

  BENCHMARK("Fibonacci 30") { return Fibonacci(30); };

  BENCHMARK("Fibonacci 35") { return Fibonacci(35); };
}

TEST_CASE("Benchmark containers", "[!benchmark]") {
  static const int size = 100;

  std::vector<int> v;
  std::map<int, int> m;

  SECTION("without generator") {
    BENCHMARK("Load up a vector") {
      v = std::vector<int>();
      for (int i = 0; i < size; ++i) v.push_back(i);
    };
    REQUIRE(v.size() == size);
  }

  SECTION("construct and destroy example") {
    BENCHMARK_ADVANCED("construct")(Catch::Benchmark::Chronometer meter) {
      std::vector<Catch::Benchmark::storage_for<std::string>> storage(
          meter.runs());
      meter.measure([&](int i) { storage[i].construct("thing"); });
    };
  }
}
#endif  // CATCH_CONFIG_ENABLE_BENCHMARKING