// Package only the prepared desktop application, never the project or videos.
module.exports = {
  appId: 'cn.scientific-revolution.reader',
  productName: '科学革命',
  electronVersion: '38.8.6',
  directories: { app: 'dist/desktop', output: 'release' },
  files: [
    'package.json', 'content.json',
    'electron/**/*.mjs', 'electron/**/*.cjs', 'shared/**/*.mjs',
    'client/index.html', 'client/assets/**/*', '!node_modules/**/*',
  ],
  // The local protocol uses filesystem realpath and ranged streams. Keep real
  // files rather than depending on ASAR's virtual filesystem semantics.
  asar: false,
  npmRebuild: false,
  forceCodeSigning: false,
  artifactName: 'Scientific-Revolution-${version}-${os}-${arch}.${ext}',
  publish: null,
  win: {
    target: [{ target: 'dir', arch: ['x64'] }],
    executableName: 'Scientific-Revolution',
    signExecutable: false,
  },
  mac: {
    target: [{ target: 'zip', arch: ['universal'] }],
    minimumSystemVersion: '12.0.0',
    category: 'public.app-category.education',
    identity: '-',
    // Ad hoc identities do not provide the team identity required for library
    // validation. Do not enable hardened runtime for this unsigned publisher.
    hardenedRuntime: false,
    notarize: false,
  },
};
