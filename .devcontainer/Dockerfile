FROM mcr.microsoft.com/devcontainers/base:debian

# Install C++ toolchain

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    build-essential \
    cmake \
    gdb \
    cppcheck \
    valgrind \
    ninja-build \
    clang libclang-rt-19-dev \
    llvm \
    curl

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get -y install --no-install-recommends \
    nodejs

## Install bazel
# RUN curl -L https://github.com/bazelbuild/bazel/releases/download/8.7.0/bazel-8.7.0-linux-arm64 -o /usr/local/bin/bazel
# RUN chmod +x /usr/local/bin/bazel