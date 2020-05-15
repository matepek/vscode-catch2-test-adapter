include(FetchContent)

FetchContent_Declare(catch2v3test
                     GIT_REPOSITORY https://github.com/catchorg/Catch2.git
                     GIT_TAG v3.0.0-preview2)

FetchContent_GetProperties(catch2v3test)
if(NOT catch2v3test_POPULATED)
  FetchContent_Populate(catch2v3test)
  add_subdirectory(${catch2v3test_SOURCE_DIR} ${catch2v3test_BINARY_DIR}
                   EXCLUDE_FROM_ALL)
endif()

#

add_library(ThirdParty.Catch2v3 INTERFACE)

target_link_libraries(ThirdParty.Catch2v3
                      INTERFACE Catch2)

target_compile_features(ThirdParty.Catch2v3 INTERFACE cxx_std_11)

target_include_directories(
  ThirdParty.Catch2v3
  INTERFACE "${catch2v3test_SOURCE_DIR}/src")

add_library(ThirdParty.Catch2v3WithMain INTERFACE)

target_link_libraries(ThirdParty.Catch2v3WithMain
                      INTERFACE ThirdParty.Catch2v3 Catch2WithMain)

#

function(add_catch2v3test_with_main target cpp_file)
  add_executable(${target} "${cpp_file}")
  target_link_libraries(${target} PUBLIC ThirdParty.Catch2v3WithMain)
  target_compile_definitions(${target} PUBLIC "CATCH_CONFIG_MAIN" "CATCH_CONFIG_ENABLE_BENCHMARKING")
endfunction()