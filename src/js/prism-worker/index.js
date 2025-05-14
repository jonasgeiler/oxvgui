// This needs to be an import so it executes before Prism
import './prism-config.js'; // eslint-disable-line import/no-unassigned-import
import { highlight, languages } from 'prismjs';

self.addEventListener('message', (event) => {
  try {
    self.postMessage({
      id: event.data.id,
      result: highlight(event.data.data, languages.svg, 'svg'),
    });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error.message,
    });
  }
});
