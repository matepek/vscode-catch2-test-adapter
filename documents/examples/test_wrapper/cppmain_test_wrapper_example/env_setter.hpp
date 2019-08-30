/**
 * In this example we execute a script which generates environment variables
 *   and we load them before the test frameworks starts to work.
 *
 * Remark: Since we have all the control here maybe there is better way to set
 *   up the tests than running a script.
 *   Also, `chmod +x` might necessary on unix-like systems.
 *
 * Note: Not tested on Windows.
 */
#pragma once

#include <stdlib.h>

#ifdef WIN32
#define CMD "env_generator.bat"
#define popen _popen
#define pclode _pclose
// https://docs.microsoft.com/en-us/previous-versions/visualstudio/visual-studio-2012/eyw7eyfw(v=vs.110)
#define setenv _putenv_s
#else
#define CMD "./env_generator.sh"  // you might need chmod +x
#endif

#include <array>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

namespace env_setter {
void loadAndSetEnvs() {
  // https://stackoverflow.com/questions/478898/how-do-i-execute-a-command-and-get-output-of-command-within-c-using-posix
  auto exec = [](const char* cmd) -> std::string {
    std::array<char, 128> buffer;
    std::string result;
    std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(cmd, "r"), pclose);
    if (!pipe) {
      throw std::runtime_error("popen() failed!");
    }
    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) {
      result += buffer.data();
    }
    return result;
  };

  // content should be like `VAR1="val1"\nVAR2="val2"\n...`
  auto content = exec(CMD);

  std::istringstream f(content);
  std::string line;
  while (std::getline(f, line)) {
    auto pos = line.find('=');
    if (pos == std::string::npos) throw std::runtime_error("wrong env format");

    auto key = line.substr(0, pos).c_str();
    auto value = line.substr(pos + 1).c_str();

    // http://man7.org/linux/man-pages/man3/setenv.3.html
    setenv(key, value, 1);
  }
}
}  // namespace env_setter

#undef popen
#undef pclode
#undef setenv
