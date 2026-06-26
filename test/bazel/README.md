# Bazel build system example

To build this example, use

```
bazel build //main:hello-world
bazel build //test:hello-test
```

## Trouble shooting

You can also get the output path:

```
bazel cquery --output=files //test:hello-test
```
