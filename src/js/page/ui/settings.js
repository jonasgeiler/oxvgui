import { createNanoEvents } from 'nanoevents';
import { domReady } from '../utils.js';
import MaterialSlider from './material-slider.js';
import Ripple from './ripple.js';

export default class Settings {
  constructor() {
    this.emitter = createNanoEvents();
    this._throttleTimeout = null;

    domReady.then(() => {
      this.container = document.querySelector('.settings');
      this._jobInputs = [
        ...this.container.querySelectorAll(
          '.jobs input:not([data-parent-job])',
        ),
      ];
      this._jobOptionInputs = [
        ...this.container.querySelectorAll('.jobs input[data-parent-job]'),
      ];
      this._globalInputs = [
        ...this.container.querySelectorAll('.global input'),
      ];

      const scroller = this.container.querySelector('.settings-scroller');
      const resetBtn = this.container.querySelector('.setting-reset');
      const ranges = this.container.querySelectorAll('input[type=range]');

      this._resetRipple = new Ripple();
      resetBtn.append(this._resetRipple.container);

      // Map real range elements to Slider instances.
      this._sliderMap = new WeakMap();
      for (const range of ranges) {
        this._sliderMap.set(range, new MaterialSlider(range));
      }

      // Map parent jobs to job option input elements.
      this._parentJobOptionInputsMap = new Map();
      for (const jobOptionInput of this._jobOptionInputs) {
        const parentJob = jobOptionInput.dataset.parentJob;
        const existingOptionInputs =
          this._parentJobOptionInputsMap.get(parentJob);
        if (existingOptionInputs) {
          existingOptionInputs.push(jobOptionInput);
        } else {
          this._parentJobOptionInputsMap.set(parentJob, [jobOptionInput]);
        }
      }

      this.container.addEventListener('input', (event) =>
        this._onChange(event),
      );
      resetBtn.addEventListener('click', () => this._onReset());

      // TODO: revisit this
      // Stop double-tap text selection.
      // This stops all text selection which is kinda sad.
      // I think this code will bite me.
      scroller.addEventListener('mousedown', (event) => {
        if (event.target.closest('input[type=range]')) return;
        event.preventDefault();
      });
    });
  }

  _onChange(event) {
    clearTimeout(this._throttleTimeout);

    // throttle range
    if (event.target.type === 'range') {
      this._throttleTimeout = setTimeout(
        () => this.emitter.emit('change'),
        150,
      );
    } else {
      const optionInputs = this._parentJobOptionInputsMap.get(
        event.target.name,
      );
      if (optionInputs) {
        for (const optionInput of optionInputs) {
          optionInput.disabled = !event.target.checked;
        }
      }

      this.emitter.emit('change');
    }
  }

  _onReset() {
    this._resetRipple.animate();
    const oldSettings = this.getSettings();

    // Set all inputs according to their initial attributes
    for (const inputEl of this._globalInputs) {
      if (inputEl.type === 'checkbox') {
        inputEl.checked = inputEl.hasAttribute('checked');
      } else if (inputEl.type === 'range') {
        this._sliderMap.get(inputEl).value = inputEl.getAttribute('value');
      }
    }

    for (const inputEl of this._jobInputs) {
      inputEl.checked = inputEl.hasAttribute('checked');

      const optionInputs = this._parentJobOptionInputsMap.get(inputEl.name);
      if (optionInputs) {
        for (const optionInput of optionInputs) {
          optionInput.checked = optionInput.hasAttribute('checked');
          optionInput.disabled = !inputEl.checked;
        }
      }
    }

    this.emitter.emit('reset', oldSettings);
    this.emitter.emit('change');
  }

  setSettings(settings) {
    for (const inputEl of this._globalInputs) {
      if (!(inputEl.name in settings)) continue;

      if (inputEl.type === 'checkbox') {
        inputEl.checked = settings[inputEl.name];
      } else if (inputEl.type === 'range') {
        this._sliderMap.get(inputEl).value = settings[inputEl.name];
      }
    }

    for (const inputEl of this._jobInputs) {
      if (!(inputEl.name in settings.jobs)) continue;
      inputEl.checked = settings.jobs[inputEl.name].enabled;

      if (settings.jobs[inputEl.name].options) {
        const optionInputs = this._parentJobOptionInputsMap.get(inputEl.name);
        if (optionInputs) {
          for (const optionInput of optionInputs) {
            if (optionInput.name in settings.jobs[inputEl.name].options) {
              optionInput.checked =
                settings.jobs[inputEl.name].options[optionInput.name];
            }
            optionInput.disabled = !inputEl.checked;
          }
        }
      }
    }
  }

  getSettings() {
    // fingerprint is used for cache lookups
    const fingerprint = [];
    const output = {
      jobs: {},
    };

    for (const inputEl of this._globalInputs) {
      if (inputEl.name !== 'gzip' && inputEl.name !== 'original') {
        if (inputEl.type === 'checkbox') {
          fingerprint.push(Number(inputEl.checked));
        } else {
          fingerprint.push(`|${inputEl.value}|`);
        }
      }

      output[inputEl.name] =
        inputEl.type === 'checkbox' ? inputEl.checked : inputEl.value;
    }

    for (const inputEl of this._jobInputs) {
      fingerprint.push(Number(inputEl.checked));
      output.jobs[inputEl.name] = { enabled: inputEl.checked };

      const optionInputs = this._parentJobOptionInputsMap.get(inputEl.name);
      if (optionInputs) {
        output.jobs[inputEl.name].options = {};
        for (const optionInput of optionInputs) {
          fingerprint.push(`{${Number(optionInput.checked)}}`);
          output.jobs[inputEl.name].options[optionInput.name] =
            optionInput.checked;
        }
      }
    }

    output.fingerprint = fingerprint.join(',');

    return output;
  }
}
