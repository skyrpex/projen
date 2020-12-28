import { join, resolve } from 'path';
import { accessSync, constants, existsSync, lstatSync, readdirSync, readJsonSync, unlinkSync } from 'fs-extra';
import * as semver from 'semver';
import { Component } from './component';
import { DependencyType } from './deps';
import { JsonFile } from './json';
import { License } from './license';
import * as logging from './logging';
import { Project } from './project';
import { Task } from './tasks';
import { exec, isTruthy, writeFile } from './util';

export interface NpmPackageOptions {
  /**
   * This is the name of your package. It gets used in URLs, as an argument on the command line,
   * and as the directory name inside node_modules.
   * See https://classic.yarnpkg.com/en/docs/package-json/#toc-name
   *
   * @default $BASEDIR
   */
  readonly name: string;

  /**
   * The description is just a string that helps people understand the purpose of the package.
   * It can be used when searching for packages in a package manager as well.
   * See https://classic.yarnpkg.com/en/docs/package-json/#toc-description
   */
  readonly description?: string;

  /**
   * Runtime dependencies of this module.
   *
   * The recommendation is to only specify the module name here (e.g.
   * `express`). This will behave similar to `yarn add` or `npm install` in the
   * sense that it will add the module as a dependency to your `package.json`
   * file with the latest version (`^`). You can specify semver requirements in
   * the same syntax passed to `npm i` or `yarn add` (e.g. `express@^2`) and
   * this will be what you `package.json` will eventually include.
   *
   * @example [ 'express', 'lodash', 'foo@^2' ]
   * @default []
   */
  readonly deps?: string[];

  /**
   * Build dependencies for this module. These dependencies will only be
   * available in your build environment but will not be fetched when this
   * module is consumed.
   *
   * The recommendation is to only specify the module name here (e.g.
   * `express`). This will behave similar to `yarn add` or `npm install` in the
   * sense that it will add the module as a dependency to your `package.json`
   * file with the latest version (`^`). You can specify semver requirements in
   * the same syntax passed to `npm i` or `yarn add` (e.g. `express@^2`) and
   * this will be what you `package.json` will eventually include.
   *
   * @example [ 'typescript', '@types/express' ]
   * @default []
   */
  readonly devDeps?: string[];

  /**
   * Peer dependencies for this module. Dependencies listed here are required to
   * be installed (and satisfied) by the _consumer_ of this library. Using peer
   * dependencies allows you to ensure that only a single module of a certain
   * library exists in the `node_modules` tree of your consumers.
   *
   * Note that prior to npm@7, peer dependencies are _not_ automatically
   * installed, which means that adding peer dependencies to a library will be a
   * breaking change for your customers.
   *
   * Unless `peerDependencyOptions.pinnedDevDependency` is disabled (it is
   * enabled by default), projen will automatically add a dev dependency with a
   * pinned version for each peer dependency. This will ensure that you build &
   * test your module against the lowest peer version required.
   *
   * @default []
   */
  readonly peerDeps?: string[];

  /**
   * List of dependencies to bundle into this module. These modules will be
   * added both to the `dependencies` section and `peerDependencies` section of
   * your `package.json`.
   *
   * The recommendation is to only specify the module name here (e.g.
   * `express`). This will behave similar to `yarn add` or `npm install` in the
   * sense that it will add the module as a dependency to your `package.json`
   * file with the latest version (`^`). You can specify semver requirements in
   * the same syntax passed to `npm i` or `yarn add` (e.g. `express@^2`) and
   * this will be what you `package.json` will eventually include.
   */
  readonly bundledDeps?: string[];

  /**
   * Options for `peerDeps`.
   */
  readonly peerDependencyOptions?: PeerDependencyOptions;

  /**
   * Allow the project to include `peerDependencies` and `bundledDependencies`.
   * This is normally only allowed for libraries. For apps, there's no meaning
   * for specifying these.
   *
   * @default true
   */
  readonly allowLibraryDependencies?: boolean;

  /**
   * Keywords to include in `package.json`.
   */
  readonly keywords?: string[];

  /**
   * Module entrypoint (`main` in `package.json`)
   *
   * Set to an empty string to not include `main` in your package.json
   *
   * @default "lib/index.js"
   */
  readonly entrypoint?: string;


  /**
   * Binary programs vended with your module.
   *
   * You can use this option to add/customize how binaries are represented in
   * your `package.json`, but unless `autoDetectBin` is `false`, every
   * executable file under `bin` will automatically be added to this section.
   */
  readonly bin?: Record<string, string>;

  /**
   * Automatically add all executables under the `bin` directory to your
   * `package.json` file under the `bin` section.
   *
   * @default true
   */
  readonly autoDetectBin?: boolean;

  /**
   * npm scripts to include. If a script has the same name as a standard script,
   * the standard script will be overwritten.
   *
   * @default {}
   */
  readonly scripts?: { [name: string]: string };


  /**
   * License copyright owner.
   *
   * @default - defaults to the value of authorName or "" if `authorName` is undefined.
   */
  readonly copyrightOwner?: string;

  /**
   * The copyright years to put in the LICENSE file.
   *
   * @default - current year
   */
  readonly copyrightPeriod?: string;

  /**
   * Determines how tasks are executed when invoked as npm scripts (yarn/npm run xyz).
   * @default NpmTaskExecution.PROJEN
   */
  readonly npmTaskExecution?: NpmTaskExecution;

  /**
   * The shell command to use in order to run the projen CLI.
   *
   * Can be used to customize in special environments.
   *
   * @default "npx projen"
   */
  readonly projenCommand?: string;

  /**
   * The Node Package Manager used to execute scripts
   *
   * @default NodePackageManager.YARN
   */
  readonly packageManager?: NodePackageManager;

  /**
   * The repository is the location where the actual code for your package lives.
   * See https://classic.yarnpkg.com/en/docs/package-json/#toc-repository
   */
  readonly repository?: string;

  /**
   * If the package.json for your package is not in the root directory (for example if it is part of a monorepo),
   * you can specify the directory in which it lives.
   */
  readonly repositoryDirectory?: string;

  /**
   * Author's name
   */
  readonly authorName?: string;

  /**
   * Author's e-mail
   */
  readonly authorEmail?: string;

  /**
   * Author's URL / Website
   */
  readonly authorUrl?: string;

  /**
   * Author's Organization
   */
  readonly authorOrganization?: boolean;

  /**
   * Package's Homepage / Website
   */
  readonly homepage?: string;

  /**
   * License's SPDX identifier.
   * See https://github.com/projen/projen/tree/master/license-text for a list of supported licenses.
   */
  readonly license?: string;

  /**
 * Indicates if a license should be added.
 *
 * @default true
 */
  readonly licensed?: boolean;

  /**
   * Package's Stability
   */
  readonly stability?: string;

}

/**
 * Represents the npm `package.json` file.
 */
export class NpmPackage extends Component {
  /**
   * The module's entrypoint (e.g. `lib/index.js`).
   */
  public readonly entrypoint: string;

  /**
   * Determines how tasks are executed when invoked as npm scripts (yarn/npm run xyz).
   */
  public readonly npmTaskExecution: NpmTaskExecution;

  /**
   * The command to use in order to run the projen CLI.
   */
  public readonly projenCommand: string;

  /**
   * Allow project to take library dependencies.
   */
  public readonly allowLibraryDependencies: boolean;

  /**
   * The package manager to use.
   */
  public readonly packageManager: NodePackageManager;

  /**
   * @deprecated use `addField(x, y)`
   */
  public readonly manifest: any;

  private readonly keywords: Set<string> = new Set();
  private readonly bin: Record<string, string> = { };
  private readonly scripts: Record<string, string[]> = { };
  private readonly engines: Record<string, string> = { };
  private readonly peerDependencyOptions: PeerDependencyOptions;
  private _renderedDeps?: NpmDependencies;

  constructor(project: Project, options: NpmPackageOptions) {
    super(project);

    this.npmTaskExecution = options.npmTaskExecution ?? NpmTaskExecution.PROJEN;
    this.projenCommand = options.projenCommand ?? 'npx projen';
    this.peerDependencyOptions = options.peerDependencyOptions ?? {};
    this.allowLibraryDependencies = options.allowLibraryDependencies ?? true;
    this.packageManager = options.packageManager ?? NodePackageManager.YARN;

    this.processDeps(options);

    this.manifest = {
      name: options.name,
      description: options.description,
      repository: !options.repository ? undefined : {
        type: 'git',
        url: options.repository,
        directory: options.repositoryDirectory,
      },
      bin: this.bin,
      scripts: () => this.renderScripts(),
      author: this.renderAuthor(options),
      homepage: options.homepage,
      devDependencies: {},
      peerDependencies: {},
      dependencies: {},
      bundledDependencies: [],
      keywords: () => Array.from(this.keywords).sort(),
      engines: () => this.renderEngines(),
      license: this.renderLicense(options),
    };


    // override any scripts from options (if specified)
    for (const [cmdname, shell] of Object.entries(options.scripts ?? {})) {
      project.addTask(cmdname, { exec: shell });
    }

    this.entrypoint = options.entrypoint ?? 'lib/index.js';
    this.manifest.main = this.entrypoint !== '' ? this.entrypoint : undefined;

    new JsonFile(this.project, 'package.json', {
      obj: this.manifest,
      marker: true,
      readonly: false, // we want "yarn add" to work and we have anti-tamper
    });

    this.addKeywords(...options.keywords ?? []);
    this.addBin(options.bin ?? { });

    // automatically add all executable files under "bin"
    if (options.autoDetectBin ?? true) {
      this.autoDiscoverBinaries();
    }
  }

  /**
   * Defines normal dependencies.
   *
   * @param deps Names modules to install. By default, the the dependency will
   * be installed in the next `npx projen` run and the version will be recorded
   * in your `package.json` file. You can upgrade manually or using `yarn
   * add/upgrade`. If you wish to specify a version range use this syntax:
   * `module@^7`.
   */
  public addDeps(...deps: string[]) {
    for (const dep of deps) {
      this.project.deps.addDependency(dep, DependencyType.RUNTIME);
    }
  }

  /**
   * Defines development/test dependencies.
   *
   * @param deps Names modules to install. By default, the the dependency will
   * be installed in the next `npx projen` run and the version will be recorded
   * in your `package.json` file. You can upgrade manually or using `yarn
   * add/upgrade`. If you wish to specify a version range use this syntax:
   * `module@^7`.
   */
  public addDevDeps(...deps: string[]) {
    for (const dep of deps) {
      this.project.deps.addDependency(dep, DependencyType.BUILD);

    }
  }

  /**
   * Defines peer dependencies.
   *
   * When adding peer dependencies, a devDependency will also be added on the
   * pinned version of the declared peer. This will ensure that you are testing
   * your code against the minimum version required from your consumers.
   *
   * @param deps Names modules to install. By default, the the dependency will
   * be installed in the next `npx projen` run and the version will be recorded
   * in your `package.json` file. You can upgrade manually or using `yarn
   * add/upgrade`. If you wish to specify a version range use this syntax:
   * `module@^7`.
   */
  public addPeerDeps(...deps: string[]) {
    if (Object.keys(deps).length && !this.allowLibraryDependencies) {
      throw new Error(`cannot add peer dependencies to an APP project: ${Object.keys(deps).join(',')}`);
    }

    for (const dep of deps) {
      this.project.deps.addDependency(dep, DependencyType.PEER);
    }
  }

  /**
   * Defines bundled dependencies.
   *
   * Bundled dependencies will be added as normal dependencies as well as to the
   * `bundledDependencies` section of your `package.json`.
   *
   * @param deps Names modules to install. By default, the the dependency will
   * be installed in the next `npx projen` run and the version will be recorded
   * in your `package.json` file. You can upgrade manually or using `yarn
   * add/upgrade`. If you wish to specify a version range use this syntax:
   * `module@^7`.
   */
  public addBundledDeps(...deps: string[]) {
    if (deps.length && !this.allowLibraryDependencies) {
      throw new Error(`cannot add bundled dependencies to an APP project: ${deps.join(',')}`);
    }

    for (const dep of deps) {
      this.project.deps.addDependency(dep, DependencyType.BUNDLED);
    }
  }


  /**
   * Adds an `engines` requirement to your package.
   * @param engine The engine (e.g. `node`)
   * @param version The semantic version requirement (e.g. `^10`)
   */
  public addEngine(engine: string, version: string) {
    this.engines[engine] = version;
  }

  /**
   * Adds keywords to package.json (deduplicated)
   * @param keywords The keywords to add
   */
  public addKeywords(...keywords: string[]) {
    for (const k of keywords) {
      this.keywords.add(k);
    }
  }

  public addBin(bins: Record<string, string>) {
    for (const [k, v] of Object.entries(bins)) {
      this.bin[k] = v;
    }
  }

  /**
   * Replaces the contents of an npm package.json script.
   *
   * @param name The script name
   * @param command The command to execute
   */
  public setScript(name: string, command: string) {
    this.scripts[name] = [command];
  }

  /**
   * Removes the npm script (always successful).
   * @param name The name of the script.
   */
  public removeScript(name: string) {
    delete this.scripts[name];
  }


  /**
   * Indicates if a script by the name name is defined.
   * @param name The name of the script
   */
  public hasScript(name: string) {
    return name in this.scripts;
  }

  /**
   * Directly set fields in `package.json`.
   * @escape
   * @param name field name
   * @param value field value
   */
  public addField(name: string, value: any) {
    this.manifest[name] = value;
  }

  /**
   * Sets the package version.
   * @param version Package version.
   */
  public addVersion(version: string) {
    this.manifest.version = version;
  }

  /**
   * Returns the command to execute in order to install all dependencies (always frozen).
   */
  public get installCommand() {
    return this.renderInstallCommand(true);
  }

  // ---------------------------------------------------------------------------------------

  public preSynthesize() {
    super.preSynthesize();
    this._renderedDeps = this.renderDependencies();
  }

  public postSynthesize() {
    super.postSynthesize();

    const outdir = this.project.outdir;

    // now we run `yarn install`, but before we do that, remove the
    // `node_modules/projen` symlink so that yarn won't hate us.
    const projenModule = resolve('node_modules', 'projen');
    try {
      if (lstatSync(projenModule).isSymbolicLink()) {
        unlinkSync(projenModule);
      }
    } catch (e) { }

    exec(this.renderInstallCommand(isTruthy(process.env.CI)), { cwd: outdir });

    this.resolveDepsAndWritePackageJson(outdir);
  }

  // -------------------------------------------------------------------------------------------

  private renderInstallCommand(frozen: boolean) {
    switch (this.packageManager) {
      case NodePackageManager.YARN:
        return [
          'yarn install',
          '--check-files', // ensure all modules exist (especially projen which was just removed).
          ...frozen ? ['--frozen-lockfile'] : [],
        ].join(' ');

      case NodePackageManager.NPM:
        return frozen
          ? 'npm ci'
          : 'npm install';

      default:
        throw new Error(`unexpected package manager ${this.packageManager}`);
    }
  }

  private processDeps(options: NpmPackageOptions) {
    const deprecate = (key: string, alt: string) => {
      if (Object.keys((options as any)[key] ?? {}).length) {
        throw new Error(`The option "${key}" is no longer supported, use "${alt}" instead (see API docs)`);
      }
    };

    deprecate('dependencies', 'deps');
    deprecate('peerDependencies', 'peerDeps');
    deprecate('devDependencies', 'devDeps');
    deprecate('bundledDependencies', 'bundledDeps');

    this.addDeps(...options.deps ?? []);
    this.addDevDeps(...options.devDeps ?? []);
    this.addPeerDeps(...options.peerDeps ?? []);
    this.addBundledDeps(...options.bundledDeps ?? []);
  }

  private renderDependencies(): NpmDependencies {
    const devDependencies: Record<string, string> = {};
    const peerDependencies: Record<string, string> = {};
    const dependencies: Record<string, string> = {};
    const bundledDependencies = new Array<string>();

    // synthetic dependencies: add a pinned build dependency to ensure we are
    // testing against the minimum requirement of the peer.
    const pinned = this.peerDependencyOptions.pinnedDevDependency ?? true;
    if (pinned) {
      for (const dep of this.project.deps.all.filter(d => d.type === DependencyType.PEER)) {
        let req = dep.name;
        if (dep.version) {
          const ver = semver.minVersion(dep.version)?.version;
          if (!ver) {
            throw new Error(`unable to determine minimum semver for peer dependency ${dep.name}@${dep.version}`);
          }

          req += '@' + ver;
        }
        this.addDevDeps(req);
      }
    }

    for (const dep of this.project.deps.all) {
      const version = dep.version ?? '*';

      switch (dep.type) {
        case DependencyType.BUNDLED:
          bundledDependencies.push(dep.name);

          if (this.project.deps.all.find(d => d.name === dep.name && d.type === DependencyType.PEER)) {
            throw new Error(`unable to bundle "${dep.name}". it cannot appear as a peer dependency`);
          }

          // also add as a runtime dependency
          dependencies[dep.name] = version;
          break;

        case DependencyType.PEER:
          peerDependencies[dep.name] = version;
          break;

        case DependencyType.RUNTIME:
          dependencies[dep.name] = version;
          break;

        case DependencyType.TEST:
        case DependencyType.DEVENV:
        case DependencyType.BUILD:
          devDependencies[dep.name] = version;
          break;
      }
    }

    // update the manifest we are about to save into `package.json`
    this.manifest.devDependencies = devDependencies;
    this.manifest.peerDependencies = peerDependencies;
    this.manifest.dependencies = dependencies;
    this.manifest.bundledDependencies = bundledDependencies;

    // nothing further to do if package.json file does not exist
    const root = join(this.project.outdir, 'package.json');
    if (!existsSync(root)) {
      return { devDependencies, peerDependencies, dependencies };
    }

    const pkg = readJsonSync(root);

    const readDeps = (user: Record<string, string>, current: Record<string, string> = {}) => {
      for (const [name, userVersion] of Object.entries(user)) {
        const currentVersion = current[name];

        // respect user version if it's not '*' or if current version is undefined
        if (userVersion !== '*' || !currentVersion || currentVersion === '*') {
          continue;
        }

        // memoize current version in memory so it is preserved when saving
        user[name] = currentVersion;
      }

      // report removals
      for (const name of Object.keys(current ?? {})) {
        if (!user[name]) {
          logging.verbose(`${name}: removed`);
        }
      }
    };

    readDeps(devDependencies, pkg.devDependencies);
    readDeps(dependencies, pkg.dependencies);
    readDeps(peerDependencies, pkg.peerDependencies);

    return { devDependencies, dependencies, peerDependencies };
  }

  private resolveDepsAndWritePackageJson(outdir: string) {
    const root = join(outdir, 'package.json');
    const pkg = readJsonSync(root);

    const resolveDeps = (current: { [name: string]: string }, user: Record<string, string>) => {
      const result: Record<string, string> = {};

      for (const [name, currentDefinition] of Object.entries(user)) {
        // find actual version from node_modules
        let desiredVersion = currentDefinition;

        if (currentDefinition === '*') {
          try {
            const modulePath = require.resolve(`${name}/package.json`, { paths: [outdir] });
            const module = readJsonSync(modulePath);
            desiredVersion = `^${module.version}`;
          } catch (e) { }

          if (!desiredVersion) {
            logging.warn(`unable to resolve version for ${name} from installed modules`);
            continue;
          }
        }

        if (currentDefinition !== desiredVersion) {
          logging.verbose(`${name}: ${currentDefinition} => ${desiredVersion}`);
        }

        result[name] = desiredVersion;
      }

      // print removed packages
      for (const name of Object.keys(current)) {
        if (!result[name]) {
          logging.verbose(`${name} removed`);
        }
      }

      return sorted(result)();
    };

    const rendered = this._renderedDeps;
    if (!rendered) {
      throw new Error('assertion failed');
    }
    pkg.dependencies = resolveDeps(pkg.dependencies, rendered.dependencies);
    pkg.devDependencies = resolveDeps(pkg.devDependencies, rendered.devDependencies);
    pkg.peerDependencies = resolveDeps(pkg.peerDependencies, rendered.peerDependencies);

    writeFile(root, JSON.stringify(pkg, undefined, 2));
  }

  private renderEngines() {
    if (Object.keys(this.engines).length === 0) {
      return undefined;
    }

    return this.engines;
  }

  private autoDiscoverBinaries() {
    const bindir = 'bin';
    if (existsSync(bindir)) {
      for (const file of readdirSync(bindir)) {
        try {
          accessSync(join(bindir, file), constants.X_OK);
          this.bin[file] = join(bindir, file).replace(/\\/g, '/');
        } catch (e) {
          // not executable, skip
        }
      }
    }
  }

  private renderAuthor(options: NpmPackageOptions) {
    let author;
    if (options.authorName) {
      author = {
        name: options.authorName,
        email: options.authorEmail,
        url: options.authorUrl,
        organization: options.authorOrganization ?? false,
      };
    } else {
      if (options.authorEmail || options.authorUrl || options.authorOrganization !== undefined) {
        throw new Error('"authorName" is required if specifying "authorEmail" or "authorUrl"');
      }
    }
    return author;
  }

  private renderScripts() {
    const result: any = {};
    for (const [name, commands] of Object.entries(this.scripts)) {
      const cmds = commands.length > 0 ? commands : ['echo "n/a"'];
      result[name] = cmds.join(' && ');
    }
    for (const task of this.project.tasks.all) {
      result[task.name] = this.npmScriptForTask(task);
    }

    return result;
  }

  private renderLicense(options: NpmPackageOptions) {
    if (options.licensed ?? true) {
      const license = options.license ?? 'Apache-2.0';
      new License(this.project, license, {
        copyrightOwner: options.copyrightOwner ?? options.authorName,
        copyrightPeriod: options.copyrightPeriod,
      });
      return license;
    } else {
      return 'UNLICENSED';
    }
  }

  private npmScriptForTask(task: Task) {
    switch (this.npmTaskExecution) {
      case NpmTaskExecution.PROJEN: return `${this.projenCommand} ${task.name}`;
      case NpmTaskExecution.SHELL: return task.toShellCommand();
      default:
        throw new Error(`invalid npmTaskExecution mode: ${this.npmTaskExecution}`);
    }
  }
}

export enum NpmTaskExecution {
  /**
   * `package.json` scripts invoke to the projen CLI.
   *
   * @example
   *
   * scripts: {
   *   "compile": "projen compile"
   * }
   */
  PROJEN = 'projen',

  /**
   * Task is implemented directly as a shell script within `package.json`.
   *
   * @example
   *
   * scripts: {
   *   "compile": "tsc"
   * }
   */
  SHELL = 'shell'
}

export interface PeerDependencyOptions {
  /**
   * Automatically add a pinned dev dependency.
   * @default true
   */
  readonly pinnedDevDependency?: boolean;
}

/**
 * The node package manager to use.
 */
export enum NodePackageManager {
  /**
   * Use `yarn` as the package manager.
   */
  YARN = 'yarn',

  /**
   * Use `npm` as the package manager.
   */
  NPM = 'npm'
}

interface NpmDependencies {
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly peerDependencies: Record<string, string>;
}

function sorted<T>(toSort: T) {
  return () => {
    if (Array.isArray(toSort)) {
      return (toSort as unknown[]).sort();
    } else if (toSort != null && typeof toSort === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(toSort).sort(([l], [r]) => l.localeCompare(r))) {
        result[key] = value;
      }
      return result as T;
    } else {
      return toSort;
    }
  };
}

