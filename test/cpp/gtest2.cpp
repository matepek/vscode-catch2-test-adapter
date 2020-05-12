// g++ -g -std=c++17 -isystem googletest/googletest/include -pthread
//   gtest.cpp libgtest.a -o gtest3

// g++ -g -std=c++17 -isystem googletest/googletest/include -isystem googletest/googlemock/include \
    -pthread ../vscode-catch2-test-adapter/test/cpp/gtest.cpp libgmock.a -o gtest.exe

// Google Test

#include <chrono>
#include <thread>

#include "gmock/gmock.h"

// static struct X{ X(){
//   std::terminate();
// }} x;

GTEST_TEST(TestCas3, test1) {
  //
  std::this_thread::sleep_for(std::chrono::milliseconds(1000));
  ASSERT_TRUE(1 == 1);
}

GTEST_TEST(TestCas3, test2) {
  //
  std::this_thread::sleep_for(std::chrono::milliseconds(1000));

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
  std::this_thread::sleep_for(std::chrono::milliseconds(1000));

  printf("Is True");
}
