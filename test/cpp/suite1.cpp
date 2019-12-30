#include "catch2/catch.hpp"

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

TEST_CASE("cout test") {
  //
  std::cout << "cout msg" << std::endl;

  REQUIRE(true);
  //
}

TEST_CASE("cerr test") {
  //
  std::cerr << "cerr msg" << std::endl;

  REQUIRE(true);
  //
}

TEST_CASE("throws an unexpected exception") {
  //
  throw std::runtime_error("this is unexpected");

  REQUIRE(true);
  //
}