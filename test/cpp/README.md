```sh
cd build && mkdir gcc && cd gcc
cmake ../.. -G Ninja -D USE_COVERAGE=ON -D CMAKE_CXX_COMPILER=g++
ninja
```

```sh
cd build && mkdir clang && cd clang
cmake ../.. -G Ninja -D USE_COVERAGE=ON -D CMAKE_CXX_COMPILER=clang++
ninja
```
