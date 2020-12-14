configure_file("manytest.sh" "manytest.sh" COPYONLY)

add_executable(echo_args "echo_args.cpp")
target_compile_features(echo_args PUBLIC cxx_std_11)

add_executable(emulator "emulator.cpp")
target_compile_features(emulator PUBLIC cxx_std_11)