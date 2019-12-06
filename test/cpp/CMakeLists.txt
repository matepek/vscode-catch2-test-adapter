cmake_minimum_required(VERSION 3.10)

set(CMAKE_BUILD_TYPE Debug)

project(Tests)

#

file(WRITE "${PROJECT_BINARY_DIR}/.vscode/settings.json" "{\n  \"catch2TestExplorer.executables\": [ \"*.exe\" ],\n  \"catch2TestExplorer.logpanel\": true\n}\n")

#

if (CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /w")
else()
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -w")  
  set(CMAKE_EXECUTABLE_SUFFIX ".exe")
endif()

#

include("GoogleTest.cmake")

add_gtest_with_main(gtest1 "gtest1.cpp")

#

include("Catch2Test.cmake")

add_catch2test_with_main(suite1 "suite1.cpp")
add_catch2test_with_main(suite2 "suite2.cpp")
add_catch2test_with_main(suite3 "suite3.cpp")
add_catch2test_with_main(suite4 "suite4.cpp")

#

include("DOCTest.cmake")

add_doctest_with_main(doctest1 "doctest1.cpp")
