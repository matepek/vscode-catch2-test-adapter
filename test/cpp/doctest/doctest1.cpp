#include <exception>
#include <iostream>
#include <vector>
#include <thread>

#include "doctest/doctest.h"
using namespace std;

TEST_CASE("lots of nested subcases - fail") {
  cout << endl << "root" << endl;
  SUBCASE("") {
    cout << "1" << endl;
    SUBCASE("") { cout << "1.1" << endl; }
  }
  SUBCASE("") {
    cout << "2" << endl;
    SUBCASE("") { cout << "2.1" << endl; }
    SUBCASE("") {
      // whops! all the subcases below shouldn't be discovered and executed!
      FAIL("");

      cout << "2.2" << endl;
      SUBCASE("") {
        cout << "2.2.1" << endl;
        SUBCASE("") { cout << "2.2.1.1" << endl; }
        SUBCASE("") { cout << "2.2.1.2" << endl; }
      }
    }
    SUBCASE("") { cout << "2.3" << endl; }
    SUBCASE("") { cout << "2.4" << endl; }
  }
}

static void call_func() {
  SUBCASE("from function...") {
    MESSAGE("print me twice");
    SUBCASE("sc1") { MESSAGE("hello! from sc1"); }
    SUBCASE("sc2") { MESSAGE("hello! from sc2"); }
  }
}

TEST_CASE("subcases can be used in a separate function as well - succ") {
  call_func();
  MESSAGE("lala");
}

SCENARIO("vectors can be sized and resized - fail") {
  GIVEN("A vector with some items") {
    std::vector<int> v(5);

    REQUIRE(v.size() == 5);
    REQUIRE(v.capacity() >= 5);

    WHEN("the size is increased") {
      v.resize(10);

      THEN("the size and capacity change") {
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
        CHECK(v.size() == 20);
        CHECK(v.capacity() >= 10);
      }
    }
    WHEN("the size is reduced") {
      v.resize(0);

      THEN("the size changes but not capacity") {
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
        CHECK(v.size() == 0);
        CHECK(v.capacity() >= 5);
      }
    }
    WHEN("more capacity is reserved") {
      v.reserve(10);

      THEN("the capacity changes but not the size") {
        CHECK(v.size() == 5);
        CHECK(v.capacity() >= 10);
      }
    }
    WHEN("less capacity is reserved") {
      v.reserve(0);

      THEN("neither size nor capacity are changed") {
        CHECK(v.size() == 10);
        CHECK(v.capacity() >= 5);
      }
    }
  }
}

TEST_CASE("test case should fail even though the last subcase passes - fail") {
  SUBCASE("one") { CHECK(false); }
  SUBCASE("two") { CHECK(true); }
}

TEST_CASE(
    "fails from an exception but gets re-entered to traverse all subcases - fail") {
  SUBCASE("level zero") {
    SUBCASE("one") { CHECK(false); }
    SUBCASE("two") { CHECK(false); }
  }
}

static void checks(int data) {
  DOCTEST_SUBCASE("check data 1") { REQUIRE(data % 2 == 0); }
  DOCTEST_SUBCASE("check data 2") { REQUIRE(data % 4 == 0); }
}

TEST_CASE("nested - related to https://github.com/doctest/doctest/issues/282 - succ") {
  DOCTEST_SUBCASE("generate data variant 1") {
    int data(44);

    // checks
    checks(data);
  }
  DOCTEST_SUBCASE("generate data variant 1") {
    int data(80);

    // checks (identical in both variants)
    checks(data);
  }
}

// names can bethe same

TEST_SUITE_BEGIN("suite1");

TEST_CASE("suite1t1 - succ") {}

TEST_SUITE_BEGIN("suite11");  // double nesting doesnt count

TEST_CASE("suite11t1 - succ") {}

TEST_SUITE_END();

TEST_CASE("with desc - succ" * doctest::description("shouldn't take more than 500ms") *
          doctest::timeout(0.5)) {
  // asserts
}

TEST_CASE("skipped" * doctest::skip(true)) {
  // skipped
}

TEST_CASE(
    "really long test name really long test name really long test name really "
    "long test name really long test name really long test name really long "
    "test name really long test name really long test name really long test "
    "name really long test name really long test name really long test name - succ") {
}

TEST_CASE("  starts with double space and ends with 2 more ") {}

TEST_CASE("exception1 - fail") { throw std::runtime_error("exeception msg"); }

TEST_CASE("testwith,char") { CHECK(false); }

TEST_CASE("test may_fail:true - succ" * doctest::may_fail()) { CHECK(true); }
TEST_CASE("test may_fail:false - succ" * doctest::may_fail()) { CHECK(false); }
TEST_CASE("test may_fail:exception - succ" * doctest::may_fail()) { throw std::runtime_error("exeception msg"); }
TEST_CASE("test may_fail:sub exception - succ" * doctest::may_fail()) { DOCTEST_SUBCASE("sub") { throw std::runtime_error("exeception msg"); } }

TEST_CASE("test should_fail:true - fail" * doctest::should_fail()) { CHECK(true); }
TEST_CASE("test should_fail:false - succ" * doctest::should_fail()) { CHECK(false); }
TEST_CASE("test should_fail:exception - succ" * doctest::should_fail()) { throw std::runtime_error("exeception msg"); }


TEST_CASE("test expected_failures(1):true - fail" * doctest::expected_failures(1)) { CHECK(true); }
TEST_CASE("test expected_failures(1):false - succ" * doctest::expected_failures(1)) { CHECK(false); }
TEST_CASE("test expected_failures(1):false false - fail" * doctest::expected_failures(1)) { CHECK(false); CHECK(false); }
TEST_CASE("test expected_failures(2):false false - succ" * doctest::expected_failures(2)) { CHECK(false); CHECK(false); }
TEST_CASE("test expected_failures(1):exception - fail" * doctest::expected_failures(1)) { throw std::runtime_error("exeception msg"); }

TEST_CASE("test mix: may_fail & should_fail:exception - succ" * doctest::may_fail() * doctest::should_fail() ) { throw std::runtime_error("exeception msg"); }

TEST_CASE("test mix: may_fail & expected_failures(1): false - succ" * doctest::may_fail() * doctest::expected_failures(1)) { CHECK(false); }
TEST_CASE("test mix: may_fail & expected_failures(1): false false - succ" * doctest::may_fail() * doctest::expected_failures(1)) { CHECK(false); CHECK(false); }

TEST_CASE("test mix: should_fail & expected_failures(1): false - succ" * doctest::should_fail() * doctest::expected_failures(1)) { CHECK(false); }
TEST_CASE("test mix: should_fail & expected_failures(1): false false - succ" * doctest::should_fail() * doctest::expected_failures(1)) { CHECK(false); CHECK(false); }

TEST_CASE("test mix: may_fail & should_fail & expected_failures(1): true - fail" * doctest::may_fail() * doctest::should_fail() * doctest::expected_failures(1)) { CHECK(true); }
TEST_CASE("test mix: may_fail & should_fail & expected_failures(1): false - succ" * doctest::may_fail() * doctest::should_fail() * doctest::expected_failures(1)) { CHECK(false); }
TEST_CASE("test mix: may_fail & should_fail & expected_failures(1): false false - succ" * doctest::may_fail() * doctest::should_fail() * doctest::expected_failures(1)) { CHECK(false); CHECK(false); }

TEST_CASE("test timeout: ok - succ" * doctest::timeout(0.1)) { CHECK(true); }
TEST_CASE("test timeout: fails - fail" * doctest::timeout(0.1)) { std::this_thread::sleep_for(std::chrono::milliseconds(200)); CHECK(true); }

TEST_SUITE("suite First")
{
  TEST_CASE("MyTest - fail") { FAIL(""); }
}

TEST_SUITE("suite Second")
{
  TEST_CASE("MyTest - fail") { FAIL("msg"); }
}

DOCTEST_TEST_CASE("fails messages are handled by the plugin - fail") {
    DOCTEST_MESSAGE("message");
    DOCTEST_FAIL_CHECK("fail_check");
    DOCTEST_FAIL("fail");
}

DOCTEST_TEST_CASE("info and capture are handled by the plugin - fail") {
    DOCTEST_CHECK(1 == 2);
    DOCTEST_INFO("INFO: " << __LINE__);
    DOCTEST_CAPTURE(__LINE__);
    DOCTEST_CHECK(3 == 4);
}

TEST_CASE("expected failure - succ" * doctest::expected_failures(1)) {
    CHECK_EQ(1, 2);
}