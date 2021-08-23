include(FetchContent)

FetchContent_Declare(cpputest
                     GIT_REPOSITORY https://github.com/cpputest/cpputest.git
                     GIT_TAG latest-passing-build)

set(TESTS OFF CACHE BOOL "Switch off CppUTest Test build")
FetchContent_MakeAvailable(cpputest)

function(add_cpputest_with_main target cpp_file)
  add_executable(${target} "${cpp_file}")
  target_link_libraries(${target} PRIVATE CppUTest CppUTestExt)
endfunction()