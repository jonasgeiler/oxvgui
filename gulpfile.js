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
const liveServer = require("live-server");
const pkg = require('./package.json');

const IS_DEV_TASK =
  process.argv.includes('dev') || process.argv.includes('--dev');
console.log(styleText('green', '--- ' + (IS_DEV_TASK ? 'Development Mode' : 'Production Mode') + ' ---'));

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

const readJSON = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
};

const minifyCss = vinylMap((buffer) => {
  return new CleanCSS(buildConfig.cleancss).minify(buffer.toString()).styles;
});

function copy() {
  return gulp
    .src([
      'src/fonts/*',
      'src/public/*',
      'src/*.json',
      '!src/config.json', // Not needed in build, only referenced in gulpfile at the moment
    ], {
      encoding: false, // Prevent image and font files from being re-encoded
    })
    .pipe(gulp.dest('build'));
}

function css() {
  return gulp
    .src('src/css/*.scss', { sourcemaps: true })
    .pipe(gulpSass.sync(buildConfig.sass).on('error', gulpSass.logError))
    .pipe(gulpif(!IS_DEV_TASK, minifyCss))
    .pipe(gulp.dest('build/', { sourcemaps: '.' }));
}

async function html() {
  const [config, headCSS] = await Promise.all([
    readJSON(path.join(__dirname, 'src', 'config.json')),
    fs.readFile(path.join(__dirname, 'build', 'head.css'), 'utf8'),
  ]);

  return gulp
    .src('src/*.html')
    .pipe(
      gulpNunjucks.compile({
        plugins: config.plugins,
        jobs: config.jobs,
        headCSS,
        OXVGUI_VERSION: pkg.version,
        OXVG_VERSION: pkg.devDependencies.svgo,
        liveBaseUrl: pkg.homepage,
        title: 'OXVGUI - OXVG User Interface',
        description: pkg.description,
      }),
    )
    .pipe(gulpif(!IS_DEV_TASK, gulpHtmlmin(buildConfig.htmlmin)))
    .pipe(gulp.dest('build'));
}

const rollupCaches = new Map();

async function js(entry, outputPath) {
  const name = path.basename(path.dirname(entry));
  const bundle = await rollup.rollup({
    cache: rollupCaches.get(entry),
    input: `src/${entry}`,
    plugins: [
      rollupReplace({
        preventAssignment: true,
        OXVGUI_VERSION: JSON.stringify(pkg.version),
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
    file: `build/${outputPath}/${name}.js`,
  });
}

async function rust() {
  await new Promise((resolve, reject) => {
    const wasmPack = childProcess.spawn('wasm-pack', [
      'build',
      IS_DEV_TASK ? '--dev' : '--release',
      '--target=web',
      '--no-pack', // Don't create package.json
      '--out-dir=src/rust/dist',
    ]);

    wasmPack.stdout.pipe(process.stdout);
    wasmPack.stderr.pipe(process.stderr);

    wasmPack.on('error', (err) => {
      const wrapErr = new Error(`Failed to spawn '${err.path} ${err.spawnargs.join(' ')}' (${err.code})`);
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
    .pipe(gulp.dest('build'));
}

function clean() {
  return fs.rm('build', { force: true, recursive: true });
}

const oxvgWorker = js.bind(null, 'js/svgo-worker/index.js', 'js/');
const allJsExceptOxvgWorker = gulp.parallel(
  js.bind(null, 'js/prism-worker/index.js', 'js/'),
  js.bind(null, 'js/gzip-worker/index.js', 'js/'),
  js.bind(null, 'js/sw/index.js', ''),
  js.bind(null, 'js/page/index.js', 'js/'),
);
const allJs = gulp.parallel(
  oxvgWorker,
  allJsExceptOxvgWorker,
);

const mainBuild = gulp.parallel(
  gulp.series(css, html),
  gulp.parallel(
    gulp.series(rust, oxvgWorker),
    allJsExceptOxvgWorker,
  ),
  copy,
);

function watch() {
  gulp.watch(['src/css/**/*.scss'], gulp.series(css, html));
  gulp.watch(['src/js/**/*.js'], allJs);
  gulp.watch(
    ['src/**/*.{html,svg,woff2}', 'src/*.json'],
    gulp.parallel(html, copy, allJs),
  );
  gulp.watch(
    ['src/rust/**/*.rs', 'Cargo.toml', 'Cargo.lock'],
    gulp.series(rust, oxvgWorker),
  );
}

function serve() {
  liveServer.start({
    root: 'build',
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
exports.copy = copy;
exports.build = mainBuild;

exports['clean-build'] = gulp.series(clean, mainBuild);

exports.dev = gulp.series(clean, mainBuild, gulp.parallel(watch, serve));
