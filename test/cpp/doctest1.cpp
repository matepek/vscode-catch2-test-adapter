#include "doctest/doctest.h"

TEST_CASE("s1t1") {
  //
  REQUIRE(std::true_type::value);
  //
}

TEST_CASE("s1t2") {
  //
  REQUIRE(std::false_type::value);
  //
}