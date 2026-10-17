#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>

#include "CppUTest/TestHarness.h"

// ---------- plain group, no fixture ----------

TEST_GROUP(Plain) {};

TEST(Plain, succeeds_without_assertion) {}

TEST(Plain, prints_output) { std::cout << "hello from CppUTest" << std::endl; }

TEST(Plain, fail_explicitly) { FAIL("explicit failure"); }

IGNORE_TEST(Plain, ignored_test) { FAIL("must not run"); }

// ---------- group with fixture, setup and teardown ----------

TEST_GROUP(Fixture) {
  int value;
  std::string text;

  void setup() {
    value = 42;
    text = "abc";
  }

  void teardown() { value = 0; }

  int helper() const { return value * 2; }
};

TEST(Fixture, uses_member_variables) {
  LONGS_EQUAL(42, value);
  CHECK_EQUAL(std::string("abc"), text);
}

TEST(Fixture, uses_member_function) { LONGS_EQUAL(84, helper()); }

TEST(Fixture, fail_uses_member_function) { LONGS_EQUAL(85, helper()); }

// ---------- boolean checks ----------

TEST_GROUP(BoolChecks) {};

TEST(BoolChecks, check_succ) { CHECK(1 + 1 == 2); }
TEST(BoolChecks, check_fail) { CHECK(1 + 1 == 3); }
TEST(BoolChecks, check_text_succ) { CHECK_TEXT(true, "message not shown"); }
TEST(BoolChecks, check_text_fail) { CHECK_TEXT(false, "custom message on failure"); }
TEST(BoolChecks, check_true_succ) { CHECK_TRUE(true); }
TEST(BoolChecks, check_true_fail) { CHECK_TRUE(false); }
TEST(BoolChecks, check_false_succ) { CHECK_FALSE(false); }
TEST(BoolChecks, check_false_fail) { CHECK_FALSE(true); }

// ---------- equality checks ----------

TEST_GROUP(EqualChecks) {};

TEST(EqualChecks, check_equal_succ) { CHECK_EQUAL(5, 2 + 3); }
TEST(EqualChecks, check_equal_fail) { CHECK_EQUAL(5, 2 + 2); }
TEST(EqualChecks, check_equal_string_succ) { CHECK_EQUAL(std::string("a"), std::string("a")); }
TEST(EqualChecks, check_equal_string_fail) { CHECK_EQUAL(std::string("a"), std::string("b")); }
TEST(EqualChecks, check_equal_text_succ) { CHECK_EQUAL_TEXT(1, 1, "text"); }
TEST(EqualChecks, check_equal_text_fail) { CHECK_EQUAL_TEXT(1, 2, "values differ"); }
TEST(EqualChecks, longs_equal_succ) { LONGS_EQUAL(100000L, 100000L); }
TEST(EqualChecks, longs_equal_fail) { LONGS_EQUAL(1, 2); }
TEST(EqualChecks, longs_equal_text_fail) { LONGS_EQUAL_TEXT(1, 2, "long mismatch"); }
TEST(EqualChecks, unsigned_longs_equal_succ) { UNSIGNED_LONGS_EQUAL(3000000000UL, 3000000000UL); }
TEST(EqualChecks, unsigned_longs_equal_fail) { UNSIGNED_LONGS_EQUAL(3000000000UL, 3000000001UL); }
TEST(EqualChecks, longlongs_equal_succ) { LONGLONGS_EQUAL(-9000000000LL, -9000000000LL); }
TEST(EqualChecks, longlongs_equal_fail) { LONGLONGS_EQUAL(-9000000000LL, 9000000000LL); }
TEST(EqualChecks, unsigned_longlongs_equal_fail) { UNSIGNED_LONGLONGS_EQUAL(1ULL, 2ULL); }
TEST(EqualChecks, bytes_equal_succ) { BYTES_EQUAL(0xAB, 0xAB); }
TEST(EqualChecks, bytes_equal_fail) { BYTES_EQUAL(0xAB, 0xCD); }
TEST(EqualChecks, signed_bytes_equal_fail) { SIGNED_BYTES_EQUAL(-1, 1); }
TEST(EqualChecks, bits_equal_succ) { BITS_EQUAL(0x0F, 0xFF, 0x0F); }
TEST(EqualChecks, bits_equal_fail) { BITS_EQUAL(0x0F, 0xF0, 0xFF); }

// ---------- strings ----------

TEST_GROUP(StringChecks) {};

TEST(StringChecks, strcmp_equal_succ) { STRCMP_EQUAL("hello", "hello"); }
TEST(StringChecks, strcmp_equal_fail) { STRCMP_EQUAL("hello", "world"); }
TEST(StringChecks, strcmp_equal_text_fail) { STRCMP_EQUAL_TEXT("hello", "world", "strings differ"); }
TEST(StringChecks, strncmp_equal_succ) { STRNCMP_EQUAL("hello", "help", 3); }
TEST(StringChecks, strncmp_equal_fail) { STRNCMP_EQUAL("hello", "world", 3); }
TEST(StringChecks, strcmp_nocase_equal_succ) { STRCMP_NOCASE_EQUAL("HeLLo", "hello"); }
TEST(StringChecks, strcmp_nocase_equal_fail) { STRCMP_NOCASE_EQUAL("hello", "hellp"); }
TEST(StringChecks, strcmp_contains_succ) { STRCMP_CONTAINS("ell", "hello"); }
TEST(StringChecks, strcmp_contains_fail) { STRCMP_CONTAINS("xyz", "hello"); }
TEST(StringChecks, strcmp_nocase_contains_succ) { STRCMP_NOCASE_CONTAINS("ELL", "hello"); }
TEST(StringChecks, strcmp_nocase_contains_fail) { STRCMP_NOCASE_CONTAINS("XYZ", "hello"); }
TEST(StringChecks, multiline_string_fail) { STRCMP_EQUAL("line1\nline2\nline3", "line1\nlineX\nline3"); }

// ---------- floating point ----------

TEST_GROUP(DoubleChecks) {};

TEST(DoubleChecks, doubles_equal_succ) { DOUBLES_EQUAL(1.0, 1.05, 0.1); }
TEST(DoubleChecks, doubles_equal_fail) { DOUBLES_EQUAL(1.0, 1.5, 0.1); }
TEST(DoubleChecks, doubles_equal_text_fail) { DOUBLES_EQUAL_TEXT(1.0, 1.5, 0.1, "too far apart"); }

// ---------- pointers and memory ----------

TEST_GROUP(PointerChecks) {
  int a;
  int b;
};

TEST(PointerChecks, pointers_equal_succ) { POINTERS_EQUAL(&a, &a); }
TEST(PointerChecks, pointers_equal_fail) { POINTERS_EQUAL(&a, &b); }
TEST(PointerChecks, pointers_equal_null_succ) { POINTERS_EQUAL(NULL, static_cast<int*>(NULL)); }
TEST(PointerChecks, function_pointers_equal_succ) { FUNCTIONPOINTERS_EQUAL(&std::strlen, &std::strlen); }
TEST(PointerChecks, memcmp_equal_succ) {
  const unsigned char x[] = {1, 2, 3};
  const unsigned char y[] = {1, 2, 3};
  MEMCMP_EQUAL(x, y, sizeof(x));
}
TEST(PointerChecks, memcmp_equal_fail) {
  const unsigned char x[] = {1, 2, 3};
  const unsigned char y[] = {1, 2, 4};
  MEMCMP_EQUAL(x, y, sizeof(x));
}

// ---------- enums ----------

enum Color { Red, Green, Blue };

TEST_GROUP(EnumChecks) {};

TEST(EnumChecks, enums_equal_int_succ) { ENUMS_EQUAL_INT(Green, Green); }
TEST(EnumChecks, enums_equal_int_fail) { ENUMS_EQUAL_INT(Red, Blue); }
TEST(EnumChecks, enums_equal_type_fail) { ENUMS_EQUAL_TYPE(unsigned char, Red, Blue); }

// ---------- comparisons ----------

TEST_GROUP(CompareChecks) {};

TEST(CompareChecks, check_compare_succ) { CHECK_COMPARE(1, <, 2); }
TEST(CompareChecks, check_compare_fail) { CHECK_COMPARE(2, <, 1); }
TEST(CompareChecks, check_compare_text_fail) { CHECK_COMPARE_TEXT(2, <=, 1, "not ordered"); }

// ---------- exceptions ----------

TEST_GROUP(ExceptionChecks) {};

static void throws_runtime_error() { throw std::runtime_error("boom"); }
static void throws_nothing() {}

TEST(ExceptionChecks, check_throws_succ) { CHECK_THROWS(std::runtime_error, throws_runtime_error()); }
TEST(ExceptionChecks, check_throws_wrong_type_fail) { CHECK_THROWS(std::logic_error, throws_runtime_error()); }
TEST(ExceptionChecks, check_throws_nothing_fail) { CHECK_THROWS(std::runtime_error, throws_nothing()); }

// ---------- failure inside helper and teardown ----------

static void failing_helper() { CHECK_EQUAL(1, 2); }

TEST_GROUP(Helper) {};

TEST(Helper, failure_in_helper_function) { failing_helper(); }

TEST_GROUP(FailingSetup) {
  void setup() { CHECK_TEXT(false, "setup failed"); }
};

TEST(FailingSetup, body_not_reached) { std::cout << "unreachable" << std::endl; }

TEST_GROUP(FailingTeardown) {
  void teardown() { CHECK_TEXT(false, "teardown failed"); }
};

TEST(FailingTeardown, test_body_passes_teardown_fails) {}

// ---------- memory leak detection ----------

TEST_GROUP(Leaks) {};

TEST(Leaks, no_leak_succ) {
  int* p = new int(1);
  delete p;
}

TEST(Leaks, leak_fail) {
  int* p = new int(1);
  (void)p;
}
