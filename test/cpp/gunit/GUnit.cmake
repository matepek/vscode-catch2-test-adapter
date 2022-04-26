include(FetchContent)

# Prevent overriding the parent project's compiler/linker
# settings on Windows
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)

FetchContent_Declare(gunit
                     GIT_REPOSITORY https://github.com/cpp-testing/GUnit.git
                     GIT_TAG v1.11.0)

FetchContent_GetProperties(gunit)
if(NOT gunit_POPULATED)
  FetchContent_Populate(gunit)
  add_subdirectory(${gunit_SOURCE_DIR} ${gunit_BINARY_DIR}
                   EXCLUDE_FROM_ALL)
endif()

mark_as_advanced(BUILD_GMOCK
                 BUILD_GTEST
                 BUILD_SHARED_LIBS
                 gmock_build_tests
                 gtest_build_samples
                 gtest_build_tests
                 gtest_disable_pthreads
                 gtest_force_shared_crt
                 gtest_hide_internal_symbols)

set_target_properties(gtest PROPERTIES FOLDER extern)
set_target_properties(gtest_main PROPERTIES FOLDER extern)
set_target_properties(gmock PROPERTIES FOLDER extern)
set_target_properties(gmock_main PROPERTIES FOLDER extern)

#

add_library(ThirdParty.GUnit INTERFACE)

target_link_libraries(ThirdParty.GUnit
                      INTERFACE gunit)

target_compile_features(ThirdParty.GUnit INTERFACE cxx_std_14)

target_include_directories(
  ThirdParty.GUnit
  INTERFACE "${gunit_SOURCE_DIR}/include")

#

function(add_gunit_with_main target cpp_file)
  add_executable(${target} "${cpp_file}")
  target_link_libraries(${target} PUBLIC ThirdParty.GUnit)
endfunction()

