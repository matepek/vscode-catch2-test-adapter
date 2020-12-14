#include "catch2/catch.hpp"

TEST_CASE("suite with label 1", "descr [1][2]") {}
TEST_CASE("suite with label 2", "descr [2][3]") {}
TEST_CASE("suite with label 3", "descr[2][3]") {}
TEST_CASE("suite with label 4", "descr [3][2]") {}
TEST_CASE("suite with label 5", "descr [1]") {}
TEST_CASE("suite with label 6", "descr [2]") {}
TEST_CASE("suite with label 7", "descr [3]") {}
TEST_CASE("suite with label 8", "descr") {}
TEST_CASE("suite with label 9", "descr [.][3][2]") {}
TEST_CASE("suite with label 10", "descr[hide][3][2]") {}
