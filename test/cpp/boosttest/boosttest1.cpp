// Automatic registration: suites, nested suites, decorators, assertion macros, results of every kind.
#define BOOST_TEST_MODULE boosttest1 test
#include <boost/test/included/unit_test.hpp>

#include <chrono>
#include <iostream>
#include <stdexcept>
#include <thread>
#include <vector>

namespace utf = boost::unit_test;
namespace tt = boost::test_tools;

// Test case outside of any suite (lives in the master suite).
BOOST_AUTO_TEST_CASE(constructors_test) {
  BOOST_CHECK_EQUAL(1, 0);
}

BOOST_AUTO_TEST_CASE(passing_without_suite) {
  BOOST_CHECK(true);
}

BOOST_AUTO_TEST_SUITE(basic_suite)

BOOST_AUTO_TEST_CASE(pass) {
  BOOST_TEST(1 + 1 == 2);
}

BOOST_AUTO_TEST_CASE(fail) {
  BOOST_TEST(1 + 1 == 3);
}

BOOST_AUTO_TEST_CASE(fail_with_message) {
  int a = 1, b = 2;
  BOOST_TEST(a == b, "a and b differ: " << a << " != " << b);
}

BOOST_AUTO_TEST_CASE(multiple_failures_in_one_case) {
  BOOST_CHECK_EQUAL(1, 2);
  BOOST_CHECK_EQUAL(3, 4);
  BOOST_CHECK_MESSAGE(false, "custom check message");
}

BOOST_AUTO_TEST_CASE(require_aborts_the_case) {
  BOOST_REQUIRE_EQUAL(1, 2);
  BOOST_ERROR("not reached");
}

BOOST_AUTO_TEST_CASE(warning_only) {
  BOOST_WARN(false);
  BOOST_WARN_MESSAGE(false, "this is only a warning");
}

BOOST_AUTO_TEST_CASE(explicit_error_and_message) {
  BOOST_TEST_MESSAGE("a log message visible with --log_level=message");
  BOOST_ERROR("explicit error");
}

BOOST_AUTO_TEST_CASE(explicit_fail) {
  BOOST_FAIL("explicit fatal failure");
}

BOOST_AUTO_TEST_CASE(no_assertion) {}

BOOST_AUTO_TEST_CASE(writes_to_stdout_and_stderr) {
  std::cout << "hello from stdout" << std::endl;
  std::cerr << "hello from stderr" << std::endl;
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE(nested_suite)

BOOST_AUTO_TEST_CASE(nested_pass) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(nested_fail) {
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_SUITE(deeply_nested_suite)

BOOST_AUTO_TEST_CASE(deep_pass) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()  // deeply_nested_suite
BOOST_AUTO_TEST_SUITE_END()  // nested_suite

// Suite re-opened: Boost.Test merges suites that share a name.
BOOST_AUTO_TEST_SUITE_END()  // basic_suite

BOOST_AUTO_TEST_SUITE(basic_suite)

BOOST_AUTO_TEST_CASE(reopened_suite_case) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()

//

BOOST_AUTO_TEST_SUITE(assertion_macros)

BOOST_AUTO_TEST_CASE(boost_test_expressions) {
  int x = 5;
  std::string s = "abc";
  BOOST_TEST(x == 5);
  BOOST_TEST(x != 6);
  BOOST_TEST(x < 6);
  BOOST_TEST(s == "abc");
  BOOST_TEST(!s.empty());
  BOOST_TEST(x == 6);  // fails, prints both operands
  BOOST_TEST(s == "abd");
}

BOOST_AUTO_TEST_CASE(floating_point) {
  BOOST_TEST(0.1 + 0.2 == 0.3, tt::tolerance(1e-9));
  BOOST_TEST(0.1 + 0.2 == 0.3);  // fails: exact comparison
  BOOST_CHECK_CLOSE(1.0, 1.0001, 0.1);
  BOOST_CHECK_CLOSE_FRACTION(1.0, 1.0001, 0.001);
  BOOST_CHECK_SMALL(1e-12, 1e-9);
  BOOST_CHECK_CLOSE(1.0, 2.0, 0.1);  // fails
}

BOOST_AUTO_TEST_CASE(collections) {
  std::vector<int> a{1, 2, 3};
  std::vector<int> b{1, 2, 4};
  BOOST_TEST(a == a, tt::per_element());
  BOOST_TEST(a == b, tt::per_element());  // fails at index 2
  BOOST_TEST(a == b);                     // fails, lexicographical form
  BOOST_CHECK_EQUAL_COLLECTIONS(a.begin(), a.end(), b.begin(), b.end());
}

BOOST_AUTO_TEST_CASE(bitwise) {
  BOOST_TEST(0b1010 == 0b1010, tt::bitwise());
  BOOST_TEST(0b1010 == 0b1001, tt::bitwise());
  BOOST_CHECK_BITWISE_EQUAL(0x0F, 0x0F);
}

BOOST_AUTO_TEST_CASE(exceptions) {
  auto throws_runtime = [] { throw std::runtime_error("boom"); };
  auto throws_logic = [] { throw std::logic_error("logic"); };
  auto no_throw = [] {};

  BOOST_CHECK_THROW(throws_runtime(), std::runtime_error);
  BOOST_CHECK_THROW(no_throw(), std::runtime_error);        // fails: nothing thrown
  BOOST_CHECK_THROW(throws_logic(), std::runtime_error);    // fails: wrong type
  BOOST_CHECK_NO_THROW(no_throw());
  BOOST_CHECK_NO_THROW(throws_runtime());                   // fails
  BOOST_CHECK_EXCEPTION(throws_runtime(), std::runtime_error,
                        [](const std::runtime_error& e) { return std::string(e.what()) == "boom"; });
  BOOST_CHECK_EXCEPTION(throws_runtime(), std::runtime_error,
                        [](const std::runtime_error& e) { return std::string(e.what()) == "other"; });  // fails
  BOOST_REQUIRE_THROW(throws_runtime(), std::runtime_error);
  BOOST_REQUIRE_NO_THROW(no_throw());
  BOOST_TEST_REQUIRE(true);
}

BOOST_AUTO_TEST_CASE(context_and_info) {
  for (int i = 0; i < 3; ++i) {
    BOOST_TEST_CONTEXT("iteration " << i) {
      BOOST_TEST_INFO("extra info for the next assertion");
      BOOST_TEST(i != 1);
    }
  }
}

BOOST_AUTO_TEST_CASE(passpoint_and_checkpoint) {
  BOOST_TEST_PASSPOINT();
  BOOST_TEST_CHECKPOINT("before the failure");
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_SUITE_END()

//

BOOST_AUTO_TEST_SUITE(unexpected_termination)

BOOST_AUTO_TEST_CASE(unexpected_std_exception) {
  throw std::runtime_error("unexpected std::exception");
}

BOOST_AUTO_TEST_CASE(unexpected_unknown_exception) {
  throw 42;
}

BOOST_AUTO_TEST_CASE(unexpected_exception_after_check) {
  BOOST_TEST(true);
  throw std::logic_error("thrown after a passing assertion");
}

// Run only on demand: the default run would take the whole process down.
BOOST_AUTO_TEST_CASE(null_pointer_dereference, *utf::disabled()) {
  volatile int* p = nullptr;
  *p = 1;
}

BOOST_AUTO_TEST_SUITE_END()

//

BOOST_AUTO_TEST_SUITE(decorators)

BOOST_AUTO_TEST_CASE(labeled, *utf::label("fast")) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(multiple_labels, *utf::label("fast") * utf::label("smoke") * utf::label("network")) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(with_description, *utf::description("A human readable description")) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(is_disabled, *utf::disabled()) {
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_CASE(is_explicitly_enabled, *utf::enabled()) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(enabled_by_condition, *utf::enable_if<true>()) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(disabled_by_condition, *utf::enable_if<false>()) {
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_CASE(expected_one_failure, *utf::expected_failures(1)) {
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_CASE(expected_two_failures_but_only_one, *utf::expected_failures(2)) {
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_CASE(decorated_tolerance, *utf::tolerance(0.01)) {
  BOOST_TEST(1.0 == 1.005);
}

BOOST_AUTO_TEST_CASE(timeout_passes, *utf::timeout(10)) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(timeout_exceeded, *utf::timeout(1)) {
  std::this_thread::sleep_for(std::chrono::milliseconds(2500));
}

BOOST_AUTO_TEST_CASE(dependency_base) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(depends_on_passing, *utf::depends_on("decorators/dependency_base")) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(depends_on_failing, *utf::depends_on("basic_suite/fail")) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(precondition_false, *utf::precondition([](utf::test_unit_id) { return false; })) {
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_CASE(combined, *utf::label("a") * utf::description("combined") * utf::timeout(10) * utf::expected_failures(1)) {
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_SUITE_END()

//

BOOST_AUTO_TEST_SUITE(suite_with_decorators, *utf::label("suite_label") * utf::description("suite level"))

BOOST_AUTO_TEST_CASE(inherits_suite_label) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(own_and_inherited_label, *utf::label("own")) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()

BOOST_AUTO_TEST_SUITE(disabled_suite, *utf::disabled())

BOOST_AUTO_TEST_CASE(in_disabled_suite) {
  BOOST_TEST(false);
}

BOOST_AUTO_TEST_CASE(re_enabled_in_disabled_suite, *utf::enabled()) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()

//

BOOST_AUTO_TEST_SUITE(naming)

BOOST_AUTO_TEST_CASE(name_with_digits_123) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(_leading_underscore) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(UPPER_and_CamelCase) {
  BOOST_TEST(true);
}

#define MACRO_GENERATED_NAME generated_by_macro
BOOST_AUTO_TEST_CASE(MACRO_GENERATED_NAME) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE( spaces_around_name ) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(
    name_on_next_line,
    *utf::label("multiline")
) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()
