import Prism from '../prism.js';
import { strToEl } from '../utils.js';

const prism = new Prism();

export default class CodeOutput {
  constructor() {
    // biome-ignore format: More readable
    this.container = strToEl(
      '<div class="code-output">' +
        '<pre><code></code></pre>' +
      '</div>'
    );
    this._codeEl = this.container.querySelector('code');
  }

  async setSvg({ text }) {
    this._codeEl.innerHTML = await prism.highlight(text);
  }

  reset() {
    this._codeEl.innerHTML = '';
  }
}
