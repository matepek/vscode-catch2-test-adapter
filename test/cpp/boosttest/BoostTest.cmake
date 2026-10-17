include(FetchContent)

# Boost.Test depends on many other Boost libraries, so the official
# CMake-ready release archive is used instead of the boostorg/test repository.
set(BOOST_INCLUDE_LIBRARIES test)
set(BOOST_ENABLE_CMAKE ON)

FetchContent_Declare(boosttest
                     URL https://github.com/boostorg/boost/releases/download/boost-1.92.0/boost-1.92.0-cmake.tar.xz
                     URL_HASH SHA256=9bed76128d4e46755dbe818487788c6fceb6f72b378f4daa49b7e1e600d9088d
                     DOWNLOAD_EXTRACT_TIMESTAMP ON
                     EXCLUDE_FROM_ALL)
FetchContent_MakeAvailable(boosttest)

#

add_library(ThirdParty.BoostTest INTERFACE)

target_link_libraries(ThirdParty.BoostTest
                      INTERFACE Boost::included_unit_test_framework)

target_compile_features(ThirdParty.BoostTest INTERFACE cxx_std_11)

#

function(add_boosttest target cpp_file)
  add_executable(${target} "${cpp_file}")
  target_link_libraries(${target} PUBLIC ThirdParty.BoostTest)
endfunction()
