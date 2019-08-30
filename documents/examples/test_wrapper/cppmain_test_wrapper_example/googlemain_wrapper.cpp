/**
 * Check env_setter.hpp for details
 *
 * https://github.com/google/googletest/blob/master/googletest/docs/primer.md#writing-the-main-function
 *
 */

#include "gtest/gtest.h"

#include "env_setter.hpp"

int main(int argc, char **argv) {
  env_setter::loadAndSetEnvs();

  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}