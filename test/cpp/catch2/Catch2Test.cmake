include(FetchContent)

FetchContent_Declare(catch2test
                     GIT_REPOSITORY https://github.com/catchorg/Catch2.git
                     GIT_TAG v2.11.1)

FetchContent_GetProperties(catch2test)
if(NOT catch2test_POPULATED)
  FetchContent_Populate(catch2test)
endif()

#

add_library(ThirdParty.Catch2 INTERFACE)

target_include_directories(ThirdParty.Catch2 
    INTERFACE "${catch2test_SOURCE_DIR}/single_include")

target_compile_features(ThirdParty.Catch2 INTERFACE cxx_std_11)

#

function(add_catch2test_with_main target cpp_file)
  add_executable(${target} "${cpp_file}")
  target_link_libraries(${target} PUBLIC ThirdParty.Catch2)
  target_compile_definitions(${target} PUBLIC "CATCH_CONFIG_MAIN" "CATCH_CONFIG_ENABLE_BENCHMARKING")
endfunction()