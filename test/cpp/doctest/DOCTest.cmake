include(FetchContent)

FetchContent_Declare(doctest
                     GIT_REPOSITORY https://github.com/doctest/doctest.git
                     GIT_TAG v2.4.12)
FetchContent_MakeAvailable(doctest)

#

add_library(ThirdParty.DOCTest INTERFACE)

target_include_directories(ThirdParty.DOCTest 
    INTERFACE "${doctest_SOURCE_DIR}")

target_compile_features(ThirdParty.DOCTest INTERFACE cxx_std_11)

#

function(add_doctest_with_main target cpp_file)
  add_executable(${target} "${cpp_file}")
  target_link_libraries(${target} PUBLIC ThirdParty.DOCTest)
  target_compile_definitions(${target} PUBLIC "DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN")
endfunction()