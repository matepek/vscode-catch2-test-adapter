#include <gtest/gtest.h>
#include <iostream>

TEST(MyTest, Test)
{
    ASSERT_TRUE(true);
}

class GlobalEnvironment : public ::testing::Environment {
  public:
    ~GlobalEnvironment() override {}

    void SetUp() override
    {
        std::cout << "GlobalEnvironment set up" << std::endl;
    }

    void TearDown() override
    {
        std::cout << "GlobalEnvironment tear down" << std::endl;
    }
};
int main(int argc, char** argv)
{
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new GlobalEnvironment());
    return RUN_ALL_TESTS();
}