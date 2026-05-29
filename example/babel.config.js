const path = require('path');
const { getConfig } = require('react-native-builder-bob/babel-config');

const coreRoot = path.resolve(__dirname, '..', 'packages', 'react-native-moq');
const uiRoot = path.resolve(__dirname, '..', 'packages', 'react-native-moq-ui');

const baseConfig = {
  presets: ['module:@react-native/babel-preset'],
};

const withCore = getConfig(baseConfig, {
  root: coreRoot,
  pkg: require(path.join(coreRoot, 'package.json')),
});

const withUi = getConfig(withCore, {
  root: uiRoot,
  pkg: require(path.join(uiRoot, 'package.json')),
});

module.exports = withUi;
