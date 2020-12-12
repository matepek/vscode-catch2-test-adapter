#include <catch2/catch_test_macros.hpp>

SCENARIO("some scenario", "[.][integration]") {
    GIVEN("a widget, a gadget, a whoozit, a whatzit, and a thingamajig") {
        WHEN("foo is barred") {
            THEN("bif is bazzed") {
                REQUIRE(true);
            }
        }
    }
}