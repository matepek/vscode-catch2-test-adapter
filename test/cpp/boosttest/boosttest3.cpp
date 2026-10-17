// Manual (non-macro) registration with a custom main() and the init function API.
#define BOOST_TEST_ALTERNATIVE_INIT_API
#define BOOST_TEST_NO_MAIN
#include <boost/test/included/unit_test.hpp>
#include <boost/test/parameterized_test.hpp>

#include <boost/bind/bind.hpp>

#include <iostream>
#include <string>

namespace utf = boost::unit_test;

void free_function_pass() {
  BOOST_TEST(true);
}

void free_function_fail() {
  BOOST_TEST(1 == 2);
}

void parametrized(int v) {
  BOOST_TEST(v < 3);
}

void parametrized_string(const std::string& s) {
  BOOST_TEST(s.size() == 3);
}

struct Class {
  void method_pass() { BOOST_TEST(true); }
  void method_fail() { BOOST_TEST(false); }
};

template <typename T>
void templated_function() {
  BOOST_TEST(sizeof(T) == 4);
}

// Test case that is also reachable through the automatic macros.
BOOST_AUTO_TEST_CASE(automatic_case_next_to_manual_ones) {
  BOOST_TEST(true);
}

bool init_function() {
  // Plain function pointers.
  utf::framework::master_test_suite().add(BOOST_TEST_CASE(&free_function_pass));
  utf::framework::master_test_suite().add(BOOST_TEST_CASE(&free_function_fail));

  // Explicit name.
  utf::framework::master_test_suite().add(
      utf::make_test_case(&free_function_pass, "explicitly_named_case", __FILE__, __LINE__));

  // Lambda.
  utf::framework::master_test_suite().add(BOOST_TEST_CASE_NAME([] { BOOST_TEST(true); }, "lambda_case"));

  // Member function bound to an instance.
  static Class instance;
  utf::framework::master_test_suite().add(BOOST_TEST_CASE_NAME(boost::bind(&Class::method_pass, &instance), "method_pass"));
  utf::framework::master_test_suite().add(BOOST_TEST_CASE_NAME(boost::bind(&Class::method_fail, &instance), "method_fail"));

  // Parametrized test cases.
  int ints[] = {1, 2, 3, 4};
  utf::framework::master_test_suite().add(BOOST_PARAM_TEST_CASE(&parametrized, ints, ints + 4));
  std::string strings[] = {"abc", "abcd"};
  utf::framework::master_test_suite().add(BOOST_PARAM_TEST_CASE(&parametrized_string, strings, strings + 2));

  // Handwritten suites, nested.
  utf::test_suite* outer = BOOST_TEST_SUITE("manual_suite");
  utf::test_suite* inner = BOOST_TEST_SUITE("manual_inner_suite");
  inner->add(BOOST_TEST_CASE_NAME(&free_function_pass, "inner_pass"));
  inner->add(BOOST_TEST_CASE_NAME(&free_function_fail, "inner_fail"));
  outer->add(inner);
  outer->add(BOOST_TEST_CASE_NAME(&free_function_pass, "outer_pass"));
  utf::framework::master_test_suite().add(outer);

  // Expected failures count given at registration.
  utf::framework::master_test_suite().add(BOOST_TEST_CASE_NAME(&free_function_fail, "expected_failure"), 1);

  // Label and disabled status set through the test_unit API.
  utf::test_case* labeled = BOOST_TEST_CASE_NAME(&free_function_pass, "manual_labeled_case");
  labeled->add_label("manual");
  utf::framework::master_test_suite().add(labeled);
  utf::test_case* disabled = BOOST_TEST_CASE_NAME(&free_function_fail, "manual_disabled_case");
  disabled->p_default_status.value = utf::test_unit::RS_DISABLED;
  utf::framework::master_test_suite().add(disabled);

  // Template test case registered by hand.
  utf::framework::master_test_suite().add(BOOST_TEST_CASE_NAME(&templated_function<int>, "templated_int"));
  utf::framework::master_test_suite().add(BOOST_TEST_CASE_NAME(&templated_function<char>, "templated_char"));

  return true;
}

int main(int argc, char* argv[]) {
  std::cout << "custom main" << std::endl;
  return utf::unit_test_main(&init_function, argc, argv);
}
