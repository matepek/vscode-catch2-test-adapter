// g++ -g -std=c++17 -isystem googletest/googletest/include -pthread
//   gtest.cpp libgtest.a -o gtest3

// g++ -g -std=c++17 -isystem googletest/googletest/include -isystem googletest/googlemock/include \
    -pthread ../vscode-catch2-test-adapter/test/cpp/gtest.cpp libgmock.a -o gtest.exe

// Google Test

#include <chrono>
#include <thread>

#include "gtest/gtest.h"
#include "gmock/gmock.h"

// static struct X{ X(){
//   std::terminate();
// }} x;

GTEST_TEST(TestCas3, test1) {
  //
  std::this_thread::sleep_for(std::chrono::milliseconds(4000));
  ASSERT_TRUE(1 == 1);
}

GTEST_TEST(TestCas3, test2) {
  //
  std::this_thread::sleep_for(std::chrono::milliseconds(4000));

  ASSERT_TRUE(1 == 1);
  ASSERT_TRUE(1 == 2);
}

GTEST_TEST(TestCas3, DISABLED_test3) {
  //
  ASSERT_TRUE(1 == 1);
}

GTEST_TEST(TestCas3, test4) {
  // GMOKC_SKIP();
  ASSERT_TRUE(1 == 1);
}

GTEST_TEST(TestCas3, test5) {
  std::this_thread::sleep_for(std::chrono::milliseconds(4000));

  printf("Is True");
}

GTEST_TEST(TestCas3, test6) {
  std::vector<int> v({5, 10});
  ASSERT_THAT(v, ::testing::ElementsAre(5, 10, 15)) << "extra message";
}

GTEST_TEST(TestExpectThat, Eq) {
  int one = 1;
  EXPECT_THAT(one, ::testing::Eq(2));
}

GTEST_TEST(TestExpectThat, StartsWith) {
  std::string text = "HelloWorld";
  EXPECT_THAT(text, ::testing::StartsWith("Hellx"));
}

// with custom matcher

// MATCHER_P(containsTokens, aSubstring, "") {
//     auto findMe = stripWhitepace(aSubstring);
//     auto withinMe = stripWhitepace(arg);
//     if (withinMe.find(findMe) != std::string::npos) {
//         return true;
//     }
//     *result_listener << "\n\n" << aSubstring << "\n\nnot found within\n\n" << arg;
//     return false;
// }

// TEST(MySuite, MyTest) {
//     auto input =
//         R"(
//             func foo() {
//                 x = 4;
//             }
//          )";

//     auto expected =
//         R"(
//     func foo() {
//         x = 5;
//     }
//     )";

//     ASSERT_THAT(input, containsTokens(expected));
// }

TEST(Threading, cerr)
{
    std::vector<std::string> t = { "Foo", "Bar", "Baz" };
    for (int i = 0; i < 8; i++) {
        for (auto const& e : t) {
            std::cerr << e << std::endl;
            if (i % 2 == 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds{ 100 });
            }
        }
    }
    EXPECT_FALSE(true);
}

void Sub1(int n) {
  EXPECT_FALSE(true);
}

TEST(Misc, scoped_trace) {
  {
    SCOPED_TRACE("A");
    Sub1(1);
  }
  // Now it won't.
  Sub1(9);
}