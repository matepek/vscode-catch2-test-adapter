#include <stdlib.h>
#include <iostream>

#include "catch2/catch_all.hpp"
// c++ -x c++ -std=c++17 -I ../Catch2/single_include -O0 -g -o suite1
// ../vscode-catch2-test-adapter/src/test/suite1.cpp

TEST_CASE("s1t1", "desc") {
  //
  REQUIRE(std::true_type::value);
  //
}

TEST_CASE("s1t2", "desc") {
  //
  REQUIRE(std::false_type::value);
  //
}

TEST_CASE("cout test") {
  //
  std::cout << "cout msg" << std::endl;

  const char* x = getenv("X");

  if (x) std::cout << "getenv(\"X\"):" << getenv("X") << std::endl;

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

TEST_CASE("warning") {
  //
  WARN("x warning x");

  CHECK(2*2 == 5);
  //
}

int throws() {
  throw std::exception();
}

TEST_CASE("throws inside CHECK") {
  //
  CHECK(throws() == 5);
  //
}
