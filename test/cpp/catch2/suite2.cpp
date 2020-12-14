#include "catch2/catch.hpp"

// c++ -x c++ -std=c++17 -I ../Catch2/single_include -O0 -g -o suite2
// ../vscode-catch2-test-adapter/src/test/suite2.cpp

TEST_CASE("s2t1", "tag1") {
  //
  REQUIRE(std::true_type::value);
  //
}

TEST_CASE("s2t2", "tag1 [.]") {
  //
  REQUIRE(std::true_type::value);
  //
}

TEST_CASE("s2t3", "tag1") {
  //
  REQUIRE(std::false_type::value);
  //
}