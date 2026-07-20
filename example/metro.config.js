const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
});

// react-native-audio-api 0.13's entry point exports AudioControls, which
// statically imports react-native-reanimated and react-native-gesture-handler
// without declaring them as dependencies. We don't use AudioControls, so
// resolve them to empty modules instead of installing them.
const AUDIO_API_STUBS = new Set([
  'react-native-reanimated',
  'react-native-gesture-handler',
]);
const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (AUDIO_API_STUBS.has(moduleName)) {
    return { type: 'empty' };
  }
  return baseResolveRequest
    ? baseResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
