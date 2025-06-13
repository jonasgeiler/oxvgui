import init, {
  getDimensions,
  optimise,
} from '../../rust/dist/oxvg_wasm_bindings';

// We have to specify the path to the wasm file because it tries to use
// `document` otherwise, which is not available in a web worker.
// We also use a relative path so the app can be hosted from a sub-route,
// and we use "../" because the worker is loaded from the `js` directory, not
// the root directory, where the file is.
const initPromise = init({
  module_or_path: '../oxvg_wasm_bindings_bg.wasm',
});

/**
 * Jobs that only accept a boolean value, not an object with parameters.
 * @type {string[]}
 */
const booleanJobs = [
  'cleanupEnableBackground',
  'collapseGroups',
  'convertEllipseToCircle',
  'mergeStyles',
  'moveElemsAttrsToGroup',
  'moveGroupAttrsToElems',
  'removeDimensions',
  'removeDoctype',
  'removeEmptyAttrs',
  'removeEmptyContainers',
  'removeMetadata',
  'removeNonInheritableGroupAttrs',
  'removeOffCanvasPaths',
  'removeRasterImages',
  'removeScripts',
  'removeStyleElement',
  'removeTitle',
  'removeUnusedNS',
  'removeUselessDefs',
  'removeViewBox',
  'removeXMLNS',
  'removeXmlProcInst',
  'reusePaths',
  'sortDefsChildren',
];

/**
 * Jobs where setting `floatPrecision` to 0 would break the output.
 * @type {string[]}
 */
const floatPrecisionNonZeroJobs = [
  'cleanupListOfValues',
  'cleanupNumericValues',
];

function compress(svgInput, settings) {
  // Setup job list
  const floatPrecision = Number(settings.floatPrecision);
  const transformPrecision = Number(settings.transformPrecision);
  const jobs = {};
  for (const [name, enabled] of Object.entries(settings.jobs)) {
    if (!enabled) continue;

    jobs[name] = booleanJobs.includes(name)
      ? true
      : {
        // 0 almost always breaks images when used on `cleanupNumericValues` and others.
        // Better to allow 0 for everything else, but switch to 1 for this job.
        floatPrecision: floatPrecision === 0 && floatPrecisionNonZeroJobs.includes(name)
          ? 1
          : floatPrecision,
        transformPrecision,
      };

    if (name === 'prefixIds') {
      // TODO: Maybe let user customize prefix in the future?
      jobs[name].prefix = 'oxvgui';
    }
  }

  /*
  console.log(jobs);

  const jobsIncrement = [];
  for (let i = 1; i < jobs.length; i++) {
    const jobs2 = {};
    for (const { name, params } of jobs) {
      jobs2[name] = params;
      if (Object.keys(jobs2).length === i) {
        break;
      }
    }
    jobsIncrement.push(jobs2);
  }

  console.log(jobsIncrement);

  for (const jobs2 of jobsIncrement) {
    console.log(jobs2);
    optimise(svgInput, {
      precheck: {},
      ...jobs2,
    });
  }
   */

  return optimise(svgInput, {
    precheck: {}, // Always run precheck with default settings
    ...jobs,
  }, settings.pretty);
}

const actions = {
  wrapOriginal({ data }) {
    return getDimensions(data);
  },
  process({ data, settings }) {
    return compress(data, settings);
  },
};

self.addEventListener('message', (event) => {
  // If the WASM file is already loaded/initiated this will resolve immediately,
  // otherwise it will wait for the WASM file to finish loading/initiating.
  initPromise.then(() => {
    self.postMessage({
      id: event.data.id,
      result: actions[event.data.action](event.data),
    });
  }).catch((error) => {
    self.postMessage({
      id: event.data.id,
      error: error.message,
    });
  });
});
