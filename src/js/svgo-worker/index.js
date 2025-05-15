import init, { optimise } from '@oxvg/wasm';

// We have to specify the path to the wasm file because it tries to use
// `document` otherwise, which is not available in a web worker.
// We also use a relative path so the app can be hosted from a sub-route,
// and we use "../" because the worker is loaded from the `js` directory, not
// the root directory, where the file is.
const initPromise = init('../oxvg_wasm_bg.wasm');

const createDimensionsExtractor = () => {
  const dimensions = {};
  const plugin = {
    type: 'visitor',
    name: 'extract-dimensions',
    fn() {
      return {
        element: {
          // Node, parentNode
          enter({ name, attributes }, { type }) {
            if (name === 'svg' && type === 'root') {
              if (
                attributes.width !== undefined &&
                attributes.height !== undefined
              ) {
                dimensions.width = Number.parseFloat(attributes.width);
                dimensions.height = Number.parseFloat(attributes.height);
              } else if (attributes.viewBox !== undefined) {
                const viewBox = attributes.viewBox.split(/,\s*|\s+/);
                dimensions.width = Number.parseFloat(viewBox[2]);
                dimensions.height = Number.parseFloat(viewBox[3]);
              }
            }
          },
        },
      };
    },
  };

  return [dimensions, plugin];
};

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
  const [dimensions, extractDimensionsPlugin] = createDimensionsExtractor();
  const data = optimise(svgInput, {
    multipass: settings.multipass,
    plugins: [...plugins, extractDimensionsPlugin],
    js2svg: {
      indent: 2,
      pretty: settings.pretty,
    },
  });

  if (!dimensions.width || !dimensions.height) {
    // TODO: Extract dimensions
    dimensions.width = 100;
    dimensions.height = 100;
    //throw new Error('No dimensions found');
  }

  return { data, dimensions };
}

const actions = {
  wrapOriginal({ data }) {
    const [dimensions, extractDimensionsPlugin] = createDimensionsExtractor();
    optimise(data, {
      plugins: [extractDimensionsPlugin],
    });

    if (!dimensions.width || !dimensions.height) {
      // TODO: Extract dimensions
      dimensions.width = 100;
      dimensions.height = 100;
      //throw new Error('No dimensions found');
    }

    return dimensions;
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
