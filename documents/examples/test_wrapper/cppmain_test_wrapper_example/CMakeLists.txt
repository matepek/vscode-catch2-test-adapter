# NOTE: This file is not part of the example.
# This is just for to test the example.

cmake_minimum_required(VERSION 3.15)

set(CMAKE_BUILD_TYPE Debug)

project(CppMainWrappers)

#

add_custom_command(
    OUTPUT "env_generator.sh"
    COMMAND ${CMAKE_COMMAND} -E copy "${CMAKE_CURRENT_SOURCE_DIR}/env_generator.sh" "${CMAKE_CURRENT_BINARY_DIR}/env_generator.sh"
    MAIN_DEPENDENCY "${CMAKE_CURRENT_SOURCE_DIR}/env_generator.sh")

add_custom_target("env_generator.sh.stamp" ALL DEPENDS "env_generator.sh")

#

include("../../../../test/cpp/GoogleTest.cmake")

add_executable(googlemain_wrapper googlemain_wrapper.cpp)

target_link_libraries(googlemain_wrapper PUBLIC ThirdParty.GoogleMock)

#

include("../../../../test/cpp/Catch2Test.cmake")

add_executable(catch2main_wrapper catch2main_wrapper.cpp)

target_link_libraries(catch2main_wrapper PUBLIC ThirdParty.Catch2)
