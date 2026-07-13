// react-native-markdown-display ships NO type declarations. This ambient shim
// lets DocsViewer import its default export without a `tsc` error. Scoped to
// Stream B's docs/ folder (per the no-touch-shared-config rule). The default
// export is the <Markdown> component; `style` is the only prop we pass.
declare module 'react-native-markdown-display';
