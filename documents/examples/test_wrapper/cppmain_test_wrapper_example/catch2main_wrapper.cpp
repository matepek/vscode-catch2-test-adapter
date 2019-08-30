/**
 * Check env_setter.hpp for details
 *
 * https://github.com/catchorg/Catch2/blob/master/docs/own-main.md
 */
#define CATCH_CONFIG_RUNNER
#include "catch2/catch.hpp"

#include "env_setter.hpp"

int main(int argc, char* argv[]) {
  env_setter::loadAndSetEnvs();

  return Catch::Session().run(argc, argv);
}