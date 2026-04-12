#include "catch2/catch_all.hpp"

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


TEMPLATE_TEST_CASE( "vectors can be sized and resized", "[vector][template]", int, std::string, (std::tuple<int,float>) ) {

  std::vector<TestType> v( 5 );

  REQUIRE( v.size() == 5 );
  REQUIRE( v.capacity() >= 5 );

  SECTION( "resizing bigger changes size and capacity" ) {
      v.resize( 10 );

      REQUIRE( v.size() == 10 );
      REQUIRE( v.capacity() >= 10 );
  }
  SECTION( "resizing smaller changes size but not capacity" ) {
      v.resize( 0 );

      REQUIRE( v.size() == 0 );
      REQUIRE( v.capacity() >= 5 );

      SECTION( "We can use the 'swap trick' to reset the capacity" ) {
          std::vector<TestType> empty;
          empty.swap( v );

          REQUIRE( v.capacity() == 0 );
      }
  }
  SECTION( "reserving smaller does not change size or capacity" ) {
      v.reserve( 0 );

      REQUIRE( v.size() == 5 );
      REQUIRE( v.capacity() >= 5 );
  }
}


TEST_CASE("Table allows pre-computed test inputs and outputs", "[example][generator]") {
    SECTION("This section is run for each row in the table") {
        auto [test_input, expected_output] =
            GENERATE(table<std::string, size_t>(
                {
                    { "one",   3 },
                    { "two",   3 },
                    { "three", 5 },
                    { "four",  4 },
                } ) );

        CAPTURE(test_input, expected_output);

        // run the test
        auto result = expected_output;

        // check it matches the pre-calculated data
        REQUIRE(result == expected_output);
    }
}