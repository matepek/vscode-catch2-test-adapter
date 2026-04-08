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
    nodejs \
    npm