cmake_minimum_required(VERSION 3.10)

set(CMAKE_BUILD_TYPE Debug)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}")

project(Tests CXX)

#

if (CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /w")
else()
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -w")  
  set(CMAKE_EXECUTABLE_SUFFIX ".exe")
endif()

#

file(WRITE "${PROJECT_BINARY_DIR}/.vscode/settings.json" "{\n  \"testMate.cpp.test.executables\": \"*.exe\",\n  \"testMate.cpp.log.logpanel\": true\n}\n")

#

add_subdirectory("catch2")
add_subdirectory("gtest")
add_subdirectory("doctest")
add_subdirectory("gbenchmark")
add_subdirectory("misc")