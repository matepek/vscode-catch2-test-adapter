#include "catch2/catch_all.hpp"

#include <iostream>

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

TEST_CASE("cerr test", "[t1][t2]") {
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

TEST_CASE("skip", "[.]") {
  //
  REQUIRE(true);
  //
}
