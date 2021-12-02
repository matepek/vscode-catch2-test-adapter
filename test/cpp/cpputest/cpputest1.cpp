#include <exception>
#include <iostream>
#include <vector>
#include <chrono>
#include <thread>

#include "CppUTest/TestHarness.h"
#include "CppUTest/CommandLineTestRunner.h"
using namespace std;

TEST_GROUP(FirstTestGroup)
{
};

TEST(FirstTestGroup, FirstTest)
{
   std::this_thread::sleep_for(std::chrono::milliseconds(2000));
}

TEST(FirstTestGroup, SecondTest)
{
   std::this_thread::sleep_for(std::chrono::milliseconds(2000));
   CHECK(false);
}

TEST(FirstTestGroup, ThirdTest)
{
   std::this_thread::sleep_for(std::chrono::milliseconds(2000));
   //FAIL("Fail me!");
}

///

TEST_GROUP(SecondTestGroup)
{
};

TEST(SecondTestGroup, FirstTest)
{
   std::this_thread::sleep_for(std::chrono::milliseconds(2000));
}

TEST(SecondTestGroup, SecondTest)
{
   std::this_thread::sleep_for(std::chrono::milliseconds(2000));
   CHECK(false);
}

TEST(SecondTestGroup, ThirdTest)
{
   std::this_thread::sleep_for(std::chrono::milliseconds(2000));
   //FAIL("Fail me!");
}


int main(int argc, char* argv[])
{
    return CommandLineTestRunner::RunAllTests(argc, argv);
}