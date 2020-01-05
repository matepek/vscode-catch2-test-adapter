// g++ -g -std=c++17 -isystem googletest/googletest/include -pthread
//   gtest.cpp libgtest.a -o gtest3

// g++ -g -std=c++17 -isystem googletest/googletest/include -isystem googletest/googlemock/include \
    -pthread ../vscode-catch2-test-adapter/test/cpp/gtest.cpp libgmock.a -o gtest.exe

// Google Test

#include "gmock/gmock.h"

GTEST_TEST(TestCas1, test1) {
  //
  ASSERT_TRUE(1 == 1);
}

GTEST_TEST(TestCas1, test2) {
  //
  ASSERT_TRUE(1 == 1);
  ASSERT_TRUE(1 == 2);
}

GTEST_TEST(TestCas1, DISABLED_test3) {
  //
  ASSERT_TRUE(1 == 1);
}

GTEST_TEST(TestCas1, test4) {
  // GMOKC_SKIP();
  ASSERT_TRUE(1 == 1);
}

GTEST_TEST(TestCas1, test5) {
  // GMOKC_SKIP();
  printf("Is True");
}

GTEST_TEST(TestCas2, test1) {
  //
  EXPECT_TRUE(1 != 1);
  EXPECT_FALSE(1 == 1);
  EXPECT_EQ(1, 2);
  EXPECT_NE(1, 1);
  EXPECT_LT(1, 1);
  EXPECT_GT(1, 1);
  EXPECT_NEAR(1.0f, 1.5f, 0.25f);
}

GTEST_TEST(TestCas2, test11) {
  //
  int one = 1;
  int two = 2;
  EXPECT_TRUE(one != one);
  EXPECT_FALSE(one == one);
  EXPECT_EQ(one, two);
  EXPECT_NE(one, one);
  EXPECT_LT(one, one);
  EXPECT_GT(one, one);

  double a = 1.0;
  double b = 1.5;
  double c = 0.25;
  EXPECT_NEAR(a, b, c);
}

void magic_func() { ASSERT_TRUE(false); }

GTEST_TEST(TestCas2, test2) {
  //
  ASSERT_NO_FATAL_FAILURE(magic_func());
}

class FailingParamTest : public testing::TestWithParam<int> {};

TEST_P(FailingParamTest, Fails1) { EXPECT_EQ(1, GetParam()); }
TEST_P(FailingParamTest, Fails2) { EXPECT_EQ(1, GetParam()); }

INSTANTIATE_TEST_CASE_P(PrintingFailingParams1, FailingParamTest,
                        testing::Values(2, 3));

INSTANTIATE_TEST_CASE_P(PrintingFailingParams2, FailingParamTest,
                        testing::Range(3, 4));

// Google Mock

#include "gmock/gmock.h"

using ::testing::Return;

struct Foo {
  virtual ~Foo() {}
  virtual int GetSize() const = 0;
  virtual void Describe(int type) = 0;
};

struct MockFoo : public Foo {
  MOCK_CONST_METHOD0(GetSize, int());
  MOCK_METHOD1(Describe, void(int type));
};

GTEST_TEST(MockTestCase, expect1) {
  MockFoo foo;

  EXPECT_CALL(foo, GetSize()).WillOnce(Return(1));

  ::testing::Mock::VerifyAndClearExpectations(&foo);
}

GTEST_TEST(MockTestCase, expect2) {
  MockFoo foo;

  EXPECT_CALL(foo, Describe(4));

  foo.Describe(3);

  ::testing::Mock::VerifyAndClearExpectations(&foo);
}

// https://stackoverflow.com/questions/29382157/how-to-test-c-template-class-with-multiple-template-parameters-using-gtest/29382470

template <class T>
class TestThreeParams : public testing::Test {};

typedef ::testing::Types<std::tuple<float, double, int16_t>,
                         std::tuple<int64_t, int8_t, float> >
    Implementations;

TYPED_TEST_CASE(TestThreeParams, Implementations);

TYPED_TEST(TestThreeParams, MaximumTest) {
  using A = typename std::tuple_element<0, decltype(TypeParam())>::type;
  using B = typename std::tuple_element<1, decltype(TypeParam())>::type;
  using C = typename std::tuple_element<2, decltype(TypeParam())>::type;

  EXPECT_TRUE(std::max<A>(A(-5), B(2)) == 5);
  EXPECT_TRUE(std::max<A>(A(-5), C(5)) == 5);
}

int main(int argc, char **argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
