#define CATCH_CONFIG_MAIN
#include "catch.hpp.txt"

// c++ -x c++ -std=c++17 -I ../Catch2/single_include -O0 -g -o suite1
// ../vscode-catch2-test-adapter/src/test/suite1.cpp

TEST_CASE("s1t1", "tag1") {
  //
  REQUIRE(std::true_type::value);
  //
}

TEST_CASE("s1t2", "tag1") {
  //
  REQUIRE(std::false_type::value);
  //
}