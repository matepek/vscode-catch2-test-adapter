#include <iostream>

#include "catch2/catch_all.hpp"

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

SCENARIO("some scenario", "[.][integration]") {
  GIVEN("a widget, a gadget, a whoozit, a whatzit, and a thingamajig") {
    WHEN("foo is barred") {
      THEN("bif is bazzed") { REQUIRE(true); }
    }
  }
}

SCENARIO("some scenario +", "[.][integration]") {
  GIVEN("a widget, a gadget, a whoozit, a whatzit, and a thingamajig") {
    WHEN("foo is barred") {
      THEN("bif is bazzed") { REQUIRE(true); }
    }
  }
}

SCENARIO("completely different", "[.][unit]") {
  GIVEN(":a widget, a gadget, a whoozit, a whatzit, and a thingamajig") {
    WHEN(":foo is barred") {
      THEN(":bif is bazzed") { REQUIRE(true); }
    }
  }
}

TEST_CASE("SectionTest should fail", "[!shouldfail]") {
  SECTION("Section 1") { FAIL("Failed to do stuff!"); }
}

TEST_CASE("SectionTest should fail2", "[!shouldfail]") {
  SECTION("Section 1") {
    CHECK(false);
    CHECK(false);
  }
}

TEST_CASE("SectionTest should fail but not", "[!shouldfail]") {
  SECTION("Section 1") { CHECK(true); }
}

TEST_CASE("SectionTest may fail", "[!mayfail]") {
  SECTION("Section 1") { REQUIRE(false); }
}

TEST_CASE("SectionTest may fail but not", "[!mayfail]") {
  SECTION("Section 1") { REQUIRE(true); }
}