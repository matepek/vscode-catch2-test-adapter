cmake_minimum_required(VERSION 3.10)

set(CMAKE_BUILD_TYPE Debug)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}")
set(CMAKE_OSX_ARCHITECTURES "x86_64")
option(USE_COVERAGE "Enable code coverage instrumentation" OFF)

project(Tests CXX)

#

if (CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /w")
else()
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -w")  
  set(CMAKE_EXECUTABLE_SUFFIX ".exe")
endif()

#

add_custom_command(
  OUTPUT ".vscode/settings.json"
  COMMAND mkdir ".vscode"
  COMMAND echo "{\n  \"testMate.cpp.test.executables\": \"*.exe\",\n  \"testMate.cpp.log.logpanel\": true\n}\n" > ".vscode/settings.json"
  VERBATIM
)
add_custom_target(
  "settings.json" ALL
  DEPENDS ".vscode/settings.json"
)

#

if(USE_COVERAGE)
    message(STATUS "Code coverage enabled.")
    if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|AppleClang")
        add_compile_options("-fprofile-instr-generate" "-fcoverage-mapping")
        add_link_options("-fprofile-instr-generate" "-fcoverage-mapping")
    else()
        message(FATAL_ERROR "Coverage flags are Clang-specific. Current compiler: ${CMAKE_CXX_COMPILER_ID}")
    endif()
endif()

#

add_subdirectory("catch2")
add_subdirectory("gtest")
add_subdirectory("doctest")
add_subdirectory("gbenchmark")
add_subdirectory("misc")
