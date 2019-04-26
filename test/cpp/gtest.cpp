// g++ -g -std=c++17 -isystem googletest/googletest/include -pthread
//   gtest.cpp libgtest.a -o gtest3

// g++ -g -std=c++17 -isystem googletest/googletest/include -isystem googletest/googlemock/include \
    -pthread ../vscode-catch2-test-adapter/test/cpp/gtest.cpp libgmock.a -o gtest.exe

// Google Test

#include "gtest/gtest.h"

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
  GTEST_SKIP();
  ASSERT_TRUE(1 == 1);
}

GTEST_TEST(TestCas2, test1) {
  //
  EXPECT_TRUE(1 != 1);
  EXPECT_FALSE(1 == 1);
  EXPECT_EQ(1, 2);
  EXPECT_NE(1, 1);
  EXPECT_LT(1, 1);
  EXPECT_GT(1, 1);
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

int main(int argc, char **argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
