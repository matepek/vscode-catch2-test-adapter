#include <chrono>
#include <iostream>
#include <thread>

int main(int argc, const char* argv[]) {
  // if (argc < 2) return 1;

  // int sec = std::atoi(argv[1]);

  std::string s;

  for (int i = 1; i < argc; ++i) {
    s.append("\"");
    s.append(argv[i]);
    s.append("\" ");
  }

  system(s.c_str());

  return 0;
}