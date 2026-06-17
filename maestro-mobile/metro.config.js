// Metro config for the standalone maestro-mobile Expo app.
// blockList keeps two things out of the RN bundle:
//   - src/domain/__sync__/**   the compile-time drift-guard (typecheck-only, never bundled)
//   - ../maestro-server/**     the CommonJS server living in the same worktree monorepo
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pin module resolution to THIS package's node_modules — it is a standalone npm
// app, not part of the bun workspace, so never hoist/resolve up the tree.
config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

config.resolver.blockList = [
  new RegExp(`${escapeRe(path.join(projectRoot, 'src/domain/__sync__'))}.*`),
  new RegExp(`${escapeRe(path.resolve(projectRoot, '..', 'maestro-server'))}.*`),
];

module.exports = config;
