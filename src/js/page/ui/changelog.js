import {
  domReady,
  escapeHtmlTag,
  strToEl,
  transitionToClass,
} from '../utils.js';

export default class Changelog {
  constructor(loadedVersion) {
    this.container = strToEl('<section class="changelog"></section>');
    this._loadedVersion = loadedVersion;
  }

  async showLogFrom(lastLoadedVersion) {
    if (lastLoadedVersion === this._loadedVersion) return;

    /** @type {{version: string, changes: string[]}[]} */
    const changelog = await fetch('changelog.json').then((response) =>
      response.json(),
    );

    const changeList = [];
    let foundLoadedVersion = false;
    let foundLastLoadedVersion = false;
    for (const release of changelog) {
      if (release.version === this._loadedVersion) {
        foundLoadedVersion = true;
      } else if (release.version === lastLoadedVersion) {
        foundLastLoadedVersion = true;
        break;
      }

      if (foundLoadedVersion) {
        for (const change of release.changes) {
          changeList.push(escapeHtmlTag`<li>${change}</li>`);
        }
      }
    }
    if (!foundLoadedVersion || !foundLastLoadedVersion) {
      // If one of the version was not found in the changelog, it would
      // list ALL the changes since the first version, or no changes at all.
      // So we just skip showing the changelog in this case.
      return;
    }

    this.container.append(
      strToEl('<h1>Updated!</h1>'),
      strToEl(`<ul>${changeList.join('')}</ul>`),
    );

    await domReady;
    transitionToClass(this.container);
  }
}
