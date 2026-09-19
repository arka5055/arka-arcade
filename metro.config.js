const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
const root = path.resolve(__dirname).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [
  new RegExp(`${root}/src/.*`),
  new RegExp(`${root}/\\.grok/.*`),
  new RegExp(`${root}/\\.vercel/.*`),
  new RegExp(`${root}/artifacts/.*`),
  new RegExp(`${root}/dist-web/.*`),
  new RegExp(`${root}/dist-skyline/.*`),
  new RegExp(`${root}/arcade/.*`),
  new RegExp(`${root}/thought-tracks/.*`),
  new RegExp(`${root}/\\.pwa-release/.*`),
];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
