const path = require('path');
const pkg = require('../packages/react-native-moq/package.json');

module.exports = {
  project: {
    ios: {
      automaticPodsInstallation: true,
    },
  },
  dependencies: {
    [pkg.name]: {
      root: path.join(__dirname, '..', 'packages', 'react-native-moq'),
      platforms: {
        // Codegen fails without explicit (empty) platform entries.
        ios: {},
        android: {},
      },
    },
  },
};
