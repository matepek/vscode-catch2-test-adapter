# Assuming you have a working cmake project with 'test1' executable
# For the sake of simpleness I will use Catch2 because this repo already containst the framework.

cmake_minimum_required(VERSION 3.15)

project(YourProjectsName)

add_executable(Test1 test1.cpp)

target_compile_features(Test1 PRIVATE cxx_noexcept)

# This generates a build system which produces a "Test1" (or "Test1.exe" on windows) executable file.

# You can try it: execute the following from the root of this project:
# `mkdir out`
# `mkdir out/cmake_test_wrapper_example`
# `cmake -S documents/examples/test_wrapper/cmake_test_wrapper_example -B out/cmake_test_wrapper_example`

# Remark: I suggest to use `ninja` build system (-G Ninja).

# Now we want a wrapper with some custom script, right?
#  There are multiple way for that like:
#  1) https://cmake.org/cmake/help/latest/command/configure_file.html
#  2) https://cmake.org/cmake/help/latest/command/file.html
#  3) https://cmake.org/cmake/help/latest/command/add_custom_command.html


# IMPORTANT: The output shoud not be modified because the extension will process it:
# - first with `--help` to determine the type:(Catch2 GTest)
# - then with framework specific parametrs to list the tests and run them.


# Examples:
#   (Remark: I haven't tested on windows.)


# 2) Assuming nothing special is required, the easiest way is 'file'. something like this:

if(WIN32)
  file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/Test1.wrapper1.bat" ">put your command here<\ncall \"${CMAKE_CURRENT_BINARY_DIR}\\Test1${CMAKE_EXECUTABLE_SUFFIX_CXX}\" %*\n")
else()
  file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/Test1.wrapper1.sh" ">put your command here<\n\"${CMAKE_CURRENT_BINARY_DIR}/Test1${CMAKE_EXECUTABLE_SUFFIX_CXX}\" \"$@\"\n")
  execute_process(COMMAND "chmod" "+x" "${CMAKE_CURRENT_BINARY_DIR}/Test1.wrapper1.sh")
endif()

# but there are some problems with this approach, which I don't intend to explain, just suggesting to use 3).


# 3) THIS IS THE WAY: add_custom_command:

if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
  add_custom_command(TARGET Test1 POST_BUILD
    COMMAND "echo" ">put your command here<" ">" "Test1.wrapper2.sh"
    COMMAND "echo" "call \"${CMAKE_CURRENT_BINARY_DIR}\\Test1${CMAKE_EXECUTABLE_SUFFIX_CXX}\" %*" ">>" "Test1.wrapper2.sh"
    MAIN_DEPENDENCY Test1
    VERBATIM
    )
else()
  add_custom_command(TARGET Test1 POST_BUILD
    COMMAND "echo" ">put your command here<" ">" "Test1.wrapper2.sh"
    COMMAND "echo" "echo put your command here" ">>" "Test1.wrapper2.sh"
    COMMAND "echo" "\"${CMAKE_CURRENT_BINARY_DIR}/Test1${CMAKE_EXECUTABLE_SUFFIX_CXX}\" \"$@\"" ">>" "Test1.wrapper2.sh"
    COMMAND "chmod" "+x" "Test1.wrapper2.sh"
    MAIN_DEPENDENCY Test1
    VERBATIM
    )
endif()

# This also "touch" the wrapper file and the extension will be notified about the change and will re-run the related tests.


# If you have more tests, a function would be helpful:

function(add_test_wrapper target)
  set(WRAPPER_OUTPUT_NAME_BASE "${target}.wrapper3")

  if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
    set(WRAPPER_OUTPUT_NAME "${WRAPPER_OUTPUT_NAME_BASE}.bat")

    add_custom_command(TARGET ${target} POST_BUILD
      COMMAND "echo" ">echo put your command here<" ">>" "${WRAPPER_OUTPUT_NAME}"
      COMMAND "echo" ">echo and here too<" ">>" "${WRAPPER_OUTPUT_NAME}"
      COMMAND "echo" "call \"${CMAKE_CURRENT_BINARY_DIR}\\${target}${CMAKE_EXECUTABLE_SUFFIX_CXX}\" %*" ">>" "${WRAPPER_OUTPUT_NAME}"
      MAIN_DEPENDENCY ${target}
      VERBATIM
      )

  else() # other platforms, you can use "elseif(...)" with "Linux" and "Darwin"
    set(WRAPPER_OUTPUT_NAME "${WRAPPER_OUTPUT_NAME_BASE}.sh")

    add_custom_command(TARGET ${target} POST_BUILD
      COMMAND "echo" "echo >put your command here<" ">>" "${WRAPPER_OUTPUT_NAME}"
      COMMAND "echo" ">echo and here too<" ">>" "${WRAPPER_OUTPUT_NAME}"
      COMMAND "echo" "\"${CMAKE_CURRENT_BINARY_DIR}/${target}${CMAKE_EXECUTABLE_SUFFIX_CXX}\" \"$@\"" ">>" "${WRAPPER_OUTPUT_NAME}"
      COMMAND "chmod" "+x" "${WRAPPER_OUTPUT_NAME}"
      MAIN_DEPENDENCY ${target}
      VERBATIM
      )
  endif()
endfunction()

# and just call:

add_test_wrapper(Test1)

# and add_test_wrapper(Test2), add_test_wrapper(Test3), etc...

# ALSO, dont forget to replace `catch2TestExplorer.executables` pattern to a stricter one like "{build,Build,BUILD,out,Out,OUT}/**/*.test-wrapper*"
#  because we don't want to match the executables just the wrappers.