'use strict';

// https://code.visualstudio.com/api/working-with-extensions/bundling-extension

const path = require('path'); // eslint-disable-line
//const webpack = require('webpack'); // eslint-disable-line
//const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  mode: 'production',

  entry: './src/main.ts',

  output: {
    path: path.resolve(__dirname, 'out', 'dist'),
    filename: 'main.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../../[resource-path]',
  },

  target: 'node',

  node: {
    __dirname: false,
  },

  devtool: 'source-map',

  optimization: {
    minimize: true,
  },

  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    'aws-sdk': 'commonjs aws-sdk',
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // TS6 resolves bare imports with the 'import' condition unless a mode is given, and ts-loader
              // passes none; limiting the program to the bundled files keeps the test-only typings out of it.
              onlyCompileBundledFiles: true,
              // the bundled-only program has './src' as its common source directory, which TS6 wants spelled out
              compilerOptions: { rootDir: '.' },
            },
          },
        ],
      },
    ],
  },

  plugins: [
    // new BundleAnalyzerPlugin(),
    // new webpack.DefinePlugin({
    //   'process.env.NODE_ENV': '"production"',
    // }),
  ],
};
