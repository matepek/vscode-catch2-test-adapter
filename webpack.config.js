const path = require('path'); // eslint-disable-line
const webpack = require('webpack'); // eslint-disable-line
//const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  mode: 'production',
  entry: './out/src/main.js',
  output: {
    path: path.resolve(__dirname, 'out', 'dist'),
    filename: 'main.bundle.js',
    devtoolModuleFilenameTemplate: '../[resource-path]',
    libraryTarget: 'commonjs2',
  },

  target: 'node',
  devtool: 'source-map',

  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    'aws-sdk': 'commonjs aws-sdk',
  },

  module: {
    rules: [
      {
        test: /\.html$/i,
        use: 'raw-loader',
      },
    ],
  },

  plugins: [
    // new BundleAnalyzerPlugin(),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': '"production"',
    }),
  ],
};
