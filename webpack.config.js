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
    filename: 'main.bundle.js',
    devtoolModuleFilenameTemplate: '../../[resource-path]',
    libraryTarget: 'commonjs2',
  },

  target: 'node',
  devtool: 'source-map',

  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    'aws-sdk': 'commonjs aws-sdk',
  },

  resolve: {
    extensions: ['.ts', '.js'],
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
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
