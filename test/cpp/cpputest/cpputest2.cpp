#include <iostream>
#include <string>
#include <vector>

#include "CppUTest/SimpleString.h"
#include "CppUTest/TestHarness.h"
#include "CppUTest/UtestMacros.h"
#include "CppUTestExt/MockSupport.h"
#include "CppUTestExt/OrderedTest.h"

// ---------- test group declared with a base class ----------

class Base : public Utest {
 public:
  int counter = 0;
};

TEST_GROUP_BASE(WithBase, Base) {
  void setup() { counter = 10; }
};

TEST(WithBase, sees_base_members) { LONGS_EQUAL(10, counter); }
TEST(WithBase, fail_sees_base_members) { LONGS_EQUAL(11, counter); }

// ---------- explicit test order ----------

TEST_GROUP(Ordered) {};

TEST_ORDERED(Ordered, second, 2) { std::cout << "ordered 2" << std::endl; }
TEST_ORDERED(Ordered, first, 1) { std::cout << "ordered 1" << std::endl; }
TEST_ORDERED(Ordered, third, 3) { std::cout << "ordered 3" << std::endl; }

// ---------- custom type comparison and printing ----------

struct Point {
  int x, y;
  bool operator==(const Point& o) const { return x == o.x && y == o.y; }
  bool operator!=(const Point& o) const { return !(*this == o); }
};

SimpleString StringFrom(const Point& p) {
  return StringFromFormat("Point(%d, %d)", p.x, p.y);
}

TEST_GROUP(CustomType) {};

TEST(CustomType, equal_succ) { CHECK_EQUAL((Point{1, 2}), (Point{1, 2})); }
TEST(CustomType, equal_fail) { CHECK_EQUAL((Point{1, 2}), (Point{3, 4})); }

// ---------- test names which look unusual ----------

TEST_GROUP(Naming) {};

TEST(Naming, a) {}
TEST(Naming, _leading_underscore) {}
TEST(Naming, With_Capitals_And_123_digits) {}
TEST(Naming, very_long_name_so_that_the_output_line_is_long_enough_to_check_how_it_gets_parsed_by_the_adapter) {}

// ---------- same test name in different groups ----------

TEST_GROUP(SameNameA) {};
TEST_GROUP(SameNameB) {};

TEST(SameNameA, same) {}
TEST(SameNameB, same) {}

// ---------- multi-line and special characters in output ----------

TEST_GROUP(Output) {};

TEST(Output, special_characters) {
  std::cout << "<xml>&amp; \"quotes\" 'single' \t tab" << std::endl;
}

TEST(Output, utprint) { UT_PRINT("printed with UT_PRINT"); }

TEST(Output, utprint_fail) {
  UT_PRINT("before failure");
  FAIL("after print");
}

TEST(Output, failure_message_with_special_characters) { FAIL("<xml>&amp; \"quotes\"\nsecond line"); }

TEST(Output, long_running) {
  for (int i = 0; i < 3; ++i) {
    std::cout << "tick " << i << std::endl;
  }
}

// ---------- CHECK_* macros evaluate once ----------

TEST_GROUP(Evaluation) {};

TEST(Evaluation, argument_evaluated_once) {
  int n = 0;
  CHECK_EQUAL(1, ++n);
  LONGS_EQUAL(1, n);
}

// ---------- mocking (CppUTestExt) ----------

TEST_GROUP(Mocking) {
  void teardown() {
    mock().checkExpectations();
    mock().clear();
  }
};

static int mocked_function(int x) {
  mock().actualCall("mocked_function").withParameter("x", x);
  return mock().intReturnValue();
}

TEST(Mocking, expected_call_succ) {
  mock().expectOneCall("mocked_function").withParameter("x", 3).andReturnValue(7);
  LONGS_EQUAL(7, mocked_function(3));
}

TEST(Mocking, expected_call_not_made_fail) { mock().expectOneCall("mocked_function").withParameter("x", 3); }

TEST(Mocking, unexpected_call_fail) { mocked_function(1); }

TEST(Mocking, wrong_parameter_fail) {
  mock().expectOneCall("mocked_function").withParameter("x", 3).andReturnValue(0);
  mocked_function(4);
}

TEST(Mocking, multiple_calls_succ) {
  mock().expectNCalls(2, "mocked_function").withParameter("x", 1).andReturnValue(0);
  mocked_function(1);
  mocked_function(1);
}

TEST(Mocking, ordered_calls_fail) {
  mock().strictOrder();
  mock().expectOneCall("first");
  mock().expectOneCall("second");
  mock().actualCall("second");
  mock().actualCall("first");
}

TEST(Mocking, no_other_calls_succ) { mock().expectNoCall("never"); }

TEST(Mocking, scoped_mock_succ) {
  mock("scope").expectOneCall("f");
  mock("scope").actualCall("f");
}

// ---------- ignored tests ----------

TEST_GROUP(Ignored) {};

IGNORE_TEST(Ignored, ignored_one) {}
IGNORE_TEST(Ignored, ignored_two) { FAIL("must not run"); }
TEST(Ignored, not_ignored) {}

// ---------- group with a single test ----------

TEST_GROUP(Single) {};
TEST(Single, only_test) {}
