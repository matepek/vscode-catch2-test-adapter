include(FetchContent)

set(HAVE_STD_REGEX ON)
set(HAVE_POSIX_REGEX ON)
set(HAVE_STEADY_CLOCK ON)

FetchContent_Declare(googlebenchmark
                     GIT_REPOSITORY https://github.com/google/benchmark.git
                     GIT_TAG v1.5.2)

FetchContent_GetProperties(googlebenchmark)
if(NOT googlebenchmark_POPULATED)
  FetchContent_Populate(googlebenchmark)
  add_subdirectory(${googlebenchmark_SOURCE_DIR} ${googlebenchmark_BINARY_DIR}
                   EXCLUDE_FROM_ALL)
endif()


add_library(ThirdParty.GoogleBenchmark INTERFACE)

target_link_libraries(ThirdParty.GoogleBenchmark
                      INTERFACE benchmark::benchmark)

target_compile_features(ThirdParty.GoogleBenchmark INTERFACE cxx_std_14)

target_include_directories(
  ThirdParty.GoogleBenchmark
  INTERFACE "${googlebenchmark_SOURCE_DIR}/include/benchmark")

#

function(add_googlebenchmark target cpp_file)
  add_executable(${target} "${cpp_file}")
  target_link_libraries(${target} PUBLIC ThirdParty.GoogleBenchmark)
endfunction()

