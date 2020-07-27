#include <chrono>
#include <iostream>
#include <thread>

int main(int argc, const char* argv[]) {
  if (argc < 2) return 1;

  int sec = std::atoi(argv[1]);

  for (int i = 2; i < argc - 1; ++i) {
    std::cout << argv[i] << std::endl;
  }

  std::this_thread::sleep_for(std::chrono::seconds(sec));

  for (int i = argc - 1; i < argc; ++i) {
    std::cout << argv[i] << std::endl;
  }

  return 0;
}