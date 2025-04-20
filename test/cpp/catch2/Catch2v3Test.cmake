include(FetchContent)

FetchContent_Declare(catch2v3test
                     GIT_REPOSITORY https://github.com/catchorg/Catch2.git
                     GIT_TAG v3.1.1)
FetchContent_MakeAvailable(catch2v3test)

#

add_library(ThirdParty.Catch2v3 ALIAS Catch2)

add_library(ThirdParty.Catch2v3WithMain ALIAS Catch2WithMain)

#

function(add_catch2v3test_with_main target cpp_files)
  add_executable(${target} ${cpp_files})
  target_link_libraries(${target} PUBLIC ThirdParty.Catch2v3WithMain)
  target_compile_definitions(${target} PUBLIC "CATCH_CONFIG_ENABLE_BENCHMARKING")
endfunction()