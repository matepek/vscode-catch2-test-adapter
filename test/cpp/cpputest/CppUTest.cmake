include(FetchContent)

set(TESTS OFF CACHE BOOL "" FORCE)
set(TESTS_BUILD_DISCOVER OFF CACHE BOOL "" FORCE)
set(EXAMPLES OFF CACHE BOOL "" FORCE)
set(CPPUTEST_FLAGS OFF CACHE BOOL "" FORCE)
set(WERROR OFF CACHE BOOL "" FORCE)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

FetchContent_Declare(cpputest
                     GIT_REPOSITORY https://github.com/cpputest/cpputest.git
                     GIT_TAG v4.0)
FetchContent_MakeAvailable(cpputest)

mark_as_advanced(C++11
                 COVERAGE
                 EXAMPLES
                 EXTENSIONS
                 LIBC_MALLOC_LEAK_DETECTION
                 MEMORY_LEAK_DETECTION
                 REAL_GTEST
                 STD_C
                 STD_CPP
                 TESTS
                 TESTS_BUILD_DISCOVER
                 VERBOSE_CONFIG
                 WERROR)

#

add_library(ThirdParty.CppUTest INTERFACE)

target_link_libraries(ThirdParty.CppUTest INTERFACE CppUTest CppUTestExt)

#

function(add_cpputest_with_main target cpp_file)
  add_executable(${target} "${cpp_file}" "cpputest_main.cpp")
  target_link_libraries(${target} PUBLIC ThirdParty.CppUTest)
endfunction()
