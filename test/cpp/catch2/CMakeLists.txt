# include("Catch2Test.cmake")

include("Catch2v3Test.cmake")

add_catch2v3test_with_main(suite1 "suite1.cpp")
add_catch2v3test_with_main(suite2 "suite2.cpp")
add_catch2v3test_with_main(suite3 "suite3.cpp")
add_catch2v3test_with_main(suite4 "suite4.cpp")
add_catch2v3test_with_main(suite5 "suite5.cpp")
add_catch2v3test_with_main(groupsuite6 "suite6.cpp")
add_catch2v3test_with_main(catch2v3_test1 "catch2v3_test1.cpp")