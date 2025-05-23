import init, {
  getDimensions,
  optimise,
} from '../../rust/dist/oxvg_wasm_bindings';

// We have to specify the path to the wasm file because it tries to use
// `document` otherwise, which is not available in a web worker.
// We also use a relative path so the app can be hosted from a sub-route,
// and we use "../" because the worker is loaded from the `js` directory, not
// the root directory, where the file is.
const initPromise = init('../oxvg_wasm_bindings_bg.wasm');

function compress(svgInput, settings) {
  // setup plugin list
  const floatPrecision = Number(settings.floatPrecision);
  const transformPrecision = Number(settings.transformPrecision);
  const plugins = [];

  for (const [name, enabled] of Object.entries(settings.plugins)) {
    if (!enabled) continue;

    const plugin = {
      name,
      params: {},
    };

    // 0 almost always breaks images when used on `cleanupNumericValues`.
    // Better to allow 0 for everything else, but switch to 1 for this plugin.
    plugin.params.floatPrecision =
      plugin.name === 'cleanupNumericValues' && floatPrecision === 0
        ? 1
        : floatPrecision;

    plugin.params.transformPrecision = transformPrecision;

    plugins.push(plugin);
  }

  // multipass optimization
  return optimise(svgInput, {
    multipass: settings.multipass,
    plugins,
    js2svg: {
      indent: 2,
      pretty: settings.pretty,
    },
  });
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
