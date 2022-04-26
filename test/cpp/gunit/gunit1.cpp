#include <GUnit.h>

GTEST("Calc Test") {
  // SetUp
  SHOULD("return succ") {
    EXPECT(5 == 5);
  }
  SHOULD("return fail") {
    EXPECT(5 == 6);
  }
  // TearDown
}