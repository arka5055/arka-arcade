const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
config.resolver.blockList = [
  /\/src\/.*/,
  /\/\.grok\/.*/,
  /\/\.vercel\/.*/,
  /\/artifacts\/.*/,
  /\/dist-web\/.*/,
  /\/\.pwa-release\/.*/,
];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
