include(FetchContent)

FetchContent_Declare(boosttest
                     GIT_REPOSITORY https://github.com/boostorg/test.git
                     GIT_TAG boost-1.79.0)

FetchContent_GetProperties(boosttest)
if(NOT boosttest_POPULATED)
  FetchContent_Populate(boosttest)
  add_subdirectory(${boosttest_SOURCE_DIR} ${boosttest_BINARY_DIR}
                   EXCLUDE_FROM_ALL)
endif()


#

add_library(ThirdParty.BoostTest INTERFACE)

target_link_libraries(ThirdParty.BoostTest
                      INTERFACE boost_test)

target_compile_features(ThirdParty.BoostTest INTERFACE cxx_std_11)

target_include_directories(
  ThirdParty.BoostTest
  INTERFACE "${boosttest_SOURCE_DIR}/include")

#

function(add_boosttest target cpp_file)
  add_executable(${target} "${cpp_file}")
  target_link_libraries(${target} PUBLIC ThirdParty.BoostTest)
endfunction()

