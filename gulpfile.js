const fs = require('node:fs/promises');
const path = require('node:path');
const process = require('node:process');
const childProcess = require('node:child_process');
const { styleText } = require('node:util');
const sass = require('sass');
const CleanCSS = require('clean-css');
const vinylMap = require('vinyl-map');
const gulp = require('gulp');
const gulpif = require('gulp-if');
const gulpSass = require('gulp-sass')(sass);
const gulpNunjucks = require('gulp-nunjucks');
const gulpHtmlmin = require('gulp-htmlmin');
const rollup = require('rollup');
const { nodeResolve: rollupResolve } = require('@rollup/plugin-node-resolve');
const rollupCommon = require('@rollup/plugin-commonjs');
const rollupReplace = require('@rollup/plugin-replace');
const rollupTerser = require('@rollup/plugin-terser');
const liveServer = require('live-server');
const TOML = require('smol-toml');
const source = require('vinyl-source-stream');
const YAML = require('yaml');

const BUILD_FOLDER = 'build';
const IS_DEV_TASK =
  process.argv.indexOf('dev') !== -1 || process.argv.indexOf('--dev') !== -1;
console.log(
  styleText(
    'green',
    `--- ${IS_DEV_TASK ? 'Development Mode' : 'Production Mode'} ---`,
  ),
);

const buildConfig = {
  cleancss: {
    level: {
      1: {
        specialComments: '0',
      },
      2: {
        all: false,
        mergeMedia: true,
        removeDuplicateMediaBlocks: true,
        removeEmpty: true,
      },
    },
    sourceMap: true,
    sourceMapInlineSources: true,
  },
  htmlmin: {
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: false,
    collapseWhitespace: true,
    decodeEntities: true,
    minifyCSS: false,
    minifyJS: true,
    removeAttributeQuotes: true,
    removeComments: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: true,
    sortClassName: true,
  },
  sass: {
    outputStyle: IS_DEV_TASK ? 'expanded' : 'compressed',
  },
  terser: {
    mangle: true,
    compress: {
      passes: 2,
    },
    format: {
      comments: false,
    },
  },
};

const readFile = async (...paths) =>
  await fs.readFile(path.join(__dirname, ...paths), 'utf8');

const readJSON = async (...paths) => {
  const content = await readFile(...paths);
  return JSON.parse(content);
};

const readTOML = async (...paths) => {
  const content = await readFile(...paths);
  return TOML.parse(content);
};

const readYAML = async (...paths) => {
  const content = await readFile(...paths);
  return YAML.parse(content);
};

const minifyCss = vinylMap((buffer) => {
  return new CleanCSS(buildConfig.cleancss).minify(buffer.toString()).styles;
});

function copy() {
  return gulp
    .src(['src/fonts/*', 'src/public/*'], {
      encoding: false, // Prevent image and font files from being re-encoded
    })
    .pipe(gulp.dest(BUILD_FOLDER));
}

function css() {
  return gulp
    .src('src/css/*.scss', { sourcemaps: true })
    .pipe(gulpSass.sync(buildConfig.sass).on('error', gulpSass.logError))
    .pipe(gulpif(!IS_DEV_TASK, minifyCss))
    .pipe(gulp.dest(BUILD_FOLDER, { sourcemaps: '.' }));
}

async function html() {
  const [config, packageJson, cargoToml, headCSS] =
    /** @type {[any, typeof import('./package.json'), any, string]} */
    await Promise.all([
      readYAML('src', 'config.yaml'),
      readJSON('package.json'),
      readTOML('Cargo.toml'),
      readFile(BUILD_FOLDER, 'head.css'),
    ]);
  const { baseUrl, title, description, author, themeColor, jobs } = config;

  return gulp
    .src('src/*.html')
    .pipe(
      gulpNunjucks.compile({
        OXVGUI_VERSION: packageJson.version,
        OXVG_VERSION: cargoToml.package.version,
        headCSS,

        baseUrl,
        title,
        description,
        author,
        themeColor,
        jobs,
      }),
    )
    .pipe(gulpif(!IS_DEV_TASK, gulpHtmlmin(buildConfig.htmlmin)))
    .pipe(gulp.dest(BUILD_FOLDER));
}

const rollupCaches = new Map();

async function js(entry, outputPath) {
  /** @type {typeof import('./package.json')} */
  const packageJson = await readJSON('package.json');

  const name = path.basename(path.dirname(entry));
  const bundle = await rollup.rollup({
    cache: rollupCaches.get(entry),
    input: `src/${entry}`,
    plugins: [
      rollupReplace({
        preventAssignment: true,
        OXVGUI_VERSION: JSON.stringify(packageJson.version),
      }),
      rollupResolve({ browser: true }),
      rollupCommon({ include: /node_modules/ }),
      // Don't use terser on development
      IS_DEV_TASK
        ? ''
        : rollupTerser(
            name === 'page'
              ? {
                  ...buildConfig.terser,
                  mangle: {
                    properties: {
                      regex: /^_/,
                    },
                  },
                }
              : buildConfig.terser,
          ),
    ],
  });

  rollupCaches.set(entry, bundle.cache);

  await bundle.write({
    sourcemap: true,
    format: 'iife',
    generatedCode: 'es2015',
    file: path.join(BUILD_FOLDER, outputPath, `${name}.js`),
  });
}

async function rust() {
  await new Promise((resolve, reject) => {
    const wasmPack = childProcess.spawn('wasm-pack', [
      BUILD_FOLDER,
      IS_DEV_TASK ? '--dev' : '--release',
      '--target=web',
      '--no-pack', // Don't create package.json
      '--out-dir=src/rust/dist',
    ]);

    wasmPack.stdout.pipe(process.stdout);
    wasmPack.stderr.pipe(process.stderr);

    wasmPack.on('error', (err) => {
      const wrapErr = new Error(
        `Failed to spawn '${err.path} ${err.spawnargs.join(' ')}' (${err.code})`,
      );
      wrapErr.cause = err;
      reject(wrapErr);
    });

    wasmPack.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`The wasm-pack process exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });

  return gulp
    .src(['src/rust/dist/oxvg_wasm_bindings_bg.wasm'], {
      encoding: false, // Prevent file from being re-encoded
    })
    .pipe(gulp.dest(BUILD_FOLDER));
}

async function manifest() {
  const config = await readYAML('src', 'config.yaml');
  const {
    name,
    longName,
    description,
    themeColor,
    appBackgroundColor,
    appDisplay,
    appStartUrl,
    appIcons,
  } = config;

  const stream = source('manifest.webmanifest');
  stream.end(
    JSON.stringify(
      {
        short_name: name,
        name: longName,
        description,
        theme_color: themeColor,
        background_color: appBackgroundColor,
        display: appDisplay,
        start_url: appStartUrl,
        icons: appIcons,
      },
      undefined,
      IS_DEV_TASK ? 2 : 0,
    ),
  );
  stream.pipe(gulp.dest(BUILD_FOLDER));
}

async function changelog() {
  const changelog = await readYAML('src', 'changelog.yaml');

  const stream = source('changelog.json');
  stream.end(JSON.stringify(changelog, undefined, IS_DEV_TASK ? 2 : 0));
  stream.pipe(gulp.dest(BUILD_FOLDER));
}

async function sitemap() {
  const config = await readYAML('src', 'config.yaml');
  const { baseUrl } = config;

  // Allow reproducible builds by setting the sitemap's `lastmod` date
  // based on the `SOURCE_DATE_EPOCH` env variable, if present.
  // For more info, see: https://reproducible-builds.org/docs/source-date-epoch/
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  const date = Number.isInteger(epoch) ? new Date(epoch * 1000) : new Date();
  const lastmod = date.toISOString().split('T', 1)[0];

  const stream = source('sitemap.xml');
  stream.end(
    [
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url>',
      `    <loc>${baseUrl}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      '    <priority>1.00</priority>',
      '  </url>',
      '</urlset>',
    ]
      .map(IS_DEV_TASK ? (l) => l : (l) => l.trim())
      .join(IS_DEV_TASK ? '\n' : ''),
  );
  stream.pipe(gulp.dest(BUILD_FOLDER));
}

async function robotsTxt() {
  const config = await readYAML('src', 'config.yaml');
  const { baseUrl } = config;

  const stream = source('robots.txt');
  stream.end(
    [
      'User-agent: *',
      'Disallow: /cdn-cgi/',
      '', // Looks nicer with an empty line
      `Sitemap: ${baseUrl}sitemap.xml`,
    ].join('\n'),
  );
  stream.pipe(gulp.dest(BUILD_FOLDER));
}

function clean() {
  return fs.rm(BUILD_FOLDER, { force: true, recursive: true });
}

const oxvgWorker = js.bind(null, 'js/oxvg-worker/index.js', 'js/');
const allJsExceptOxvgWorker = gulp.parallel(
  js.bind(null, 'js/prism-worker/index.js', 'js/'),
  js.bind(null, 'js/gzip-worker/index.js', 'js/'),
  js.bind(null, 'js/sw/index.js', ''),
  js.bind(null, 'js/page/index.js', 'js/'),
);
const allJs = gulp.parallel(oxvgWorker, allJsExceptOxvgWorker);

const mainBuild = gulp.parallel(
  gulp.series(css, html),
  gulp.parallel(gulp.series(rust, oxvgWorker), allJsExceptOxvgWorker),
  manifest,
  changelog,
  sitemap,
  robotsTxt,
  copy,
);

function watch() {
  gulp.watch(['src/css/**/*.scss'], gulp.series(css, html));
  gulp.watch(['src/js/**/*.js'], allJs);
  gulp.watch(
    ['src/**/*.{html,svg,woff2}', 'src/*.yaml', 'package.json', 'Cargo.toml'],
    gulp.parallel(html, copy, allJs, manifest, changelog, sitemap, robotsTxt),
  );
  gulp.watch(
    ['src/rust/**/*.rs', 'Cargo.toml', 'Cargo.lock'],
    gulp.series(rust, oxvgWorker),
  );
}

function serve() {
  liveServer.start({
    root: BUILD_FOLDER,
    host: 'localhost',
    logLevel: 0,
    open: false,
    wait: 3000,
  });
  console.log(styleText('green', '---\nServing at http://localhost:8080\n---'));
}

exports.clean = clean;
exports.js = allJs;
exports.css = css;
exports.html = html;
exports.rust = rust;
exports.manifest = manifest;
exports.changelog = changelog;
exports.sitemap = sitemap;
exports['robots-txt'] = robotsTxt;
exports.copy = copy;

exports.build = gulp.series(clean, mainBuild);
exports.dev = gulp.series(clean, mainBuild, gulp.parallel(watch, serve));
