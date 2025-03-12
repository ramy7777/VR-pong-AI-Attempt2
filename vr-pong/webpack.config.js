const path = require('path');

module.exports = {
  mode: 'production',
  entry: './js/openai-bundle.js',
  output: {
    filename: 'openai-realtime-bundle.js',
    path: path.resolve(__dirname, 'js'),
  },
  resolve: {
    fallback: {
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer/"),
      "util": require.resolve("util/"),
      "process": require.resolve("process/browser"),
    },
  },
  plugins: [
    new (require('webpack').ProvidePlugin)({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
}; 