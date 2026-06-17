module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['react-native-unistyles/plugin', { root: 'src' }],
      // Reanimated 4 uses the worklets plugin; it must be listed LAST.
      'react-native-worklets/plugin',
    ],
  };
};
