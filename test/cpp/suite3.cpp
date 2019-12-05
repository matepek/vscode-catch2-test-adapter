#include "catch2/catch.hpp"

// clang-format off
// c++ -x c++ -std=c++17 -I ../Catch2/single_include -O0 -g -o suite3 ../vscode-catch2-test-adapter/src/test/suite3.cpp
// clang-format on

TEST_CASE("test name,with,colon", "tag1") {
  //
  REQUIRE(std::true_type::value);
  //
}

TEST_CASE(" test name with space ") {
  //
  REQUIRE(std::true_type::value);
  //
}

TEST_CASE("SECTION tree") {
  SECTION("1") {
    SECTION("2") {
      SECTION("3") {
        SECTION("4") { REQUIRE(std::false_type::value); }
      }
    }
    SECTION("2-2") {
      SECTION("3") {
        SECTION("4") { REQUIRE(std::false_type::value); }
      }
    }
  }
}

TEST_CASE("name with * character") {}
TEST_CASE("spec ! char") {}
TEST_CASE("spec @ char") {}
TEST_CASE("spec # char") {}
TEST_CASE("spec $ char") {}
TEST_CASE("spec % char") {}
TEST_CASE("spec ^ char") {}
TEST_CASE("spec & char") {}
TEST_CASE("spec * char") {}
TEST_CASE("spec (a) char") {}
TEST_CASE("spec {a} char") {}
TEST_CASE("spec [a] char") {}
TEST_CASE("spec ; char") {}
TEST_CASE("spec ' char") {}
TEST_CASE("spec \\ char") {}
TEST_CASE("spec , char") {}
TEST_CASE("spec . char") {}
TEST_CASE("spec / char") {}
TEST_CASE("spec < char") {}
TEST_CASE("spec > char") {}
TEST_CASE("spec ? char") {}
TEST_CASE("spec - char") {}
TEST_CASE("spec = char") {}
TEST_CASE("spec _ char") {}
TEST_CASE("spec + char") {}
TEST_CASE("spec ~ char") {}
TEST_CASE("spec ` char") {}
TEST_CASE("spec § char") {}
TEST_CASE("spec ± char") {}
TEST_CASE("spec \" char") {}
TEST_CASE("spec | char") {}

TEST_CASE("spec char in section name") {
  SECTION("`Config`s can be serialized") {
    //
    REQUIRE(true == false);
  }
}
