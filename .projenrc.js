const { JsiiProject, JsonFile, TextFile } = require('./lib');

const project = new JsiiProject({
  name: 'projen',
  description: 'A new generation of project generators',
  repository: 'https://github.com/projen/projen.git',
  authorName: 'Elad Ben-Israel',
  authorEmail: 'benisrae@amazon.com',
  stability: 'experimental',

  bundledDeps: [
    'yaml',
    'fs-extra',
    'yargs',
    'decamelize',
    'glob@^7',
    'semver',
    'inquirer',
    'chalk',
    '@iarna/toml',
  ],

  devDeps: [
    '@types/fs-extra@^8',
    '@types/yargs',
    '@types/glob',
    '@types/inquirer',
    '@types/semver',
    'markmac',
  ],

  projenDevDependency: false, // because I am projen
  releaseToNpm: true,
  minNodeVersion: '10.17.0',
  codeCov: true,
  compileBeforeTest: true, // since we want to run the cli in tests
  gitpod: true,
  // since this is projen, we need to always compile before we run
  projenCommand: '/bin/bash ./projen.bash',
});

// this script is what we use as the projen command in this project
// it will compile the project if needed and then run the cli.
new TextFile(project, 'projen.bash', {
  lines: [
    '#!/bin/bash',
    `# ${TextFile.PROJEN_MARKER}`,
    'set -euo pipefail',
    'if [ ! -f lib/cli/index.js ]; then',
    '  echo "compiling the cli..."',
    `  ${project.compileTask.toShellCommand()}`,
    'fi',
    'exec bin/projen $@',
  ],
});

project.addExcludeFromCleanup('test/**');
project.gitignore.include('templates/**');

// expand markdown macros in readme
const macros = project.addTask('readme-macros');
macros.exec('mv README.md README.md.bak');
macros.exec('cat README.md.bak | markmac > README.md');
macros.exec('rm README.md.bak');
project.buildTask.spawn(macros);

new JsonFile(project, '.markdownlint.json', {
  obj: {
    'default': true,
    'commands-show-output': false,
    'line-length': {
      line_length: 200,
    },
  },
});

project.vscode.launchConfiguration.addConfiguration({
  type: 'pwa-node',
  request: 'launch',
  name: 'projen CLI',
  skipFiles: [
    '<node_internals>/**',
  ],
  program: '${workspaceFolder}/lib/cli/index.js',
  outFiles: [
    '${workspaceFolder}/lib/**/*.js',
  ],
});

project.github.addMergifyRules({
  name: 'Label core contributions',
  actions: {
    label: {
      add: ['contribution/core'],
    },
  },
  conditions: [
    'author~=^(eladb)$',
    'label!=contribution/core',
  ],
});

project.gitpod.addTasks({
  name: 'Setup',
  init: 'yarn install',
  prebuild: 'bash ./projen.bash',
  command: 'npx projen build',
});

project.synth();
