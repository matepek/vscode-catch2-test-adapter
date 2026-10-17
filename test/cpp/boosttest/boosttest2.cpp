// Fixtures, templated tests and data-driven tests.
#define BOOST_TEST_MODULE boosttest2 fixtures templates data
#include <boost/test/included/unit_test.hpp>

#include <boost/mpl/list.hpp>
#include <boost/test/data/monomorphic.hpp>
#include <boost/test/data/test_case.hpp>

#include <iostream>
#include <string>
#include <tuple>
#include <vector>

namespace utf = boost::unit_test;
namespace data = boost::unit_test::data;

// --- fixtures -------------------------------------------------------------------------------------------------------

struct Fixture {
  Fixture() : value(42) { std::cout << "Fixture::Fixture" << std::endl; }
  ~Fixture() { std::cout << "Fixture::~Fixture" << std::endl; }
  int value;
};

struct ThrowingFixture {
  ThrowingFixture() { throw std::runtime_error("fixture setup failed"); }
};

struct SuiteFixture {
  SuiteFixture() : name("suite") { std::cout << "SuiteFixture setup" << std::endl; }
  ~SuiteFixture() { std::cout << "SuiteFixture teardown" << std::endl; }
  std::string name;
};

struct OtherFixture {
  OtherFixture() : other(7) {}
  int other;
};

struct GlobalFixture {
  GlobalFixture() { std::cout << "GlobalFixture setup" << std::endl; }
  ~GlobalFixture() { std::cout << "GlobalFixture teardown" << std::endl; }
};
BOOST_GLOBAL_FIXTURE(GlobalFixture);

struct SetupTeardownFixture {
  void setup() { std::cout << "SetupTeardownFixture::setup" << std::endl; }
  void teardown() { std::cout << "SetupTeardownFixture::teardown" << std::endl; }
};
BOOST_TEST_GLOBAL_FIXTURE(SetupTeardownFixture);

BOOST_AUTO_TEST_SUITE(fixture_tests)

BOOST_FIXTURE_TEST_CASE(fixture_case_pass, Fixture) {
  BOOST_TEST(value == 42);
}

BOOST_FIXTURE_TEST_CASE(fixture_case_fail, Fixture) {
  BOOST_TEST(value == 0);
}

BOOST_FIXTURE_TEST_CASE(fixture_case_with_decorator, Fixture, *utf::label("fixture")) {
  BOOST_TEST(value == 42);
}

BOOST_FIXTURE_TEST_CASE(fixture_setup_throws, ThrowingFixture) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(decorator_fixture, *utf::fixture<OtherFixture>()) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(decorator_fixture_with_setup_teardown, *utf::fixture<SetupTeardownFixture>()) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_CASE(decorator_fixture_function,
                     *utf::fixture([] { std::cout << "setup" << std::endl; }, [] { std::cout << "teardown" << std::endl; })) {
  BOOST_TEST(true);
}

BOOST_AUTO_TEST_SUITE_END()

BOOST_FIXTURE_TEST_SUITE(fixture_suite, SuiteFixture)

BOOST_AUTO_TEST_CASE(sees_suite_fixture_members) {
  BOOST_TEST(name == "suite");
}

BOOST_FIXTURE_TEST_CASE(case_fixture_replaces_suite_fixture, OtherFixture) {
  BOOST_TEST(other == 7);
}

BOOST_AUTO_TEST_CASE(failing_with_suite_fixture) {
  BOOST_TEST(name == "other");
}

BOOST_AUTO_TEST_SUITE_END()

BOOST_FIXTURE_TEST_SUITE(fixture_suite_with_decorator, SuiteFixture, *utf::label("suite_fixture"))

BOOST_AUTO_TEST_CASE(case_in_decorated_fixture_suite) {
  BOOST_TEST(name == "suite");
}

BOOST_AUTO_TEST_SUITE_END()

// --- templated tests ------------------------------------------------------------------------------------------------

BOOST_AUTO_TEST_SUITE(template_tests)

typedef boost::mpl::list<int, long, unsigned char> integral_types;

BOOST_AUTO_TEST_CASE_TEMPLATE(template_pass, T, integral_types) {
  T v = 1;
  BOOST_TEST(v + 1 == 2);
}

BOOST_AUTO_TEST_CASE_TEMPLATE(template_fail_for_some, T, integral_types) {
  BOOST_TEST(sizeof(T) > 1);  // fails for unsigned char
}

typedef boost::mpl::list<float, double> floating_types;

BOOST_AUTO_TEST_CASE_TEMPLATE(floating_type_list, T, floating_types) {
  T v = 0.5;
  BOOST_TEST(v * 2 == 1);
}

typedef std::tuple<char, short> tuple_types;

BOOST_AUTO_TEST_CASE_TEMPLATE(std_tuple_type_list, T, tuple_types) {
  BOOST_TEST(sizeof(T) >= 1);
}

typedef boost::mpl::list<std::string> string_only;

BOOST_AUTO_TEST_CASE_TEMPLATE(single_type, T, string_only) {
  T s = "x";
  BOOST_TEST(s.size() == 1);
}

template <typename T>
struct TemplateFixture {
  T value = T();
};

BOOST_FIXTURE_TEST_CASE_TEMPLATE(template_with_fixture, T, integral_types, TemplateFixture<T>) {
  BOOST_TEST(this->value == 0);
}

BOOST_AUTO_TEST_SUITE_END()

// --- data-driven tests ----------------------------------------------------------------------------------------------

BOOST_AUTO_TEST_SUITE(dataset_tests)

BOOST_DATA_TEST_CASE(array_dataset, data::make({1, 2, 3, 4}), v) {
  BOOST_TEST(v > 0);
}

BOOST_DATA_TEST_CASE(array_dataset_some_fail, data::make({1, 2, 3, 4}), v) {
  BOOST_TEST(v % 2 == 0);
}

static const int c_array[] = {5, 6, 7};

BOOST_DATA_TEST_CASE(c_array_dataset, c_array, v) {
  BOOST_TEST(v >= 5);
}

static const std::vector<std::string> words{"alpha", "beta", "gamma"};

BOOST_DATA_TEST_CASE(vector_dataset, words, w) {
  BOOST_TEST(!w.empty());
}

BOOST_DATA_TEST_CASE(string_dataset, data::make({"one", "two", "three"}), s) {
  BOOST_TEST(std::string(s).size() >= 3);
}

BOOST_DATA_TEST_CASE(xrange_dataset, data::xrange(5), i) {
  BOOST_TEST(i < 5);
}

BOOST_DATA_TEST_CASE(xrange_with_step, data::xrange(0, 10, 3), i) {
  BOOST_TEST(i % 3 == 0);
}

BOOST_DATA_TEST_CASE(zip_datasets, data::make({1, 2, 3}) ^ data::make({"a", "b", "c"}), number, letter) {
  BOOST_TEST(number > 0);
  BOOST_TEST(std::string(letter).size() == 1);
}

BOOST_DATA_TEST_CASE(zip_three_datasets, data::make({1, 2}) ^ data::make({3, 4}) ^ data::make({5, 6}), a, b, c) {
  BOOST_TEST(a + b + c > 0);
}

BOOST_DATA_TEST_CASE(cartesian_datasets, data::make({1, 2, 3}) * data::make({10, 20}), a, b) {
  BOOST_TEST(a * b != 40);  // fails for (2, 20)
}

BOOST_DATA_TEST_CASE(dataset_join, data::make({1, 2}) + data::make({10, 20}), v) {
  BOOST_TEST(v > 0);
}

struct DataFixture {
  DataFixture() : base(100) {}
  int base;
};

BOOST_DATA_TEST_CASE_F(DataFixture, dataset_with_fixture, data::make({1, 2, 3}), v) {
  BOOST_TEST(base + v > 100);
}

BOOST_AUTO_TEST_SUITE_END()
