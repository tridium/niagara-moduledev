'use strict';

const MODULE_URL_REGEX = /^\/module\//, //is this a URL request for /module/?
      MODULE_ORD_REGEX = /^module:\/\//, //is this a module:// ORD?
      NMODULE_REGEX = /^nmodule\//; //is this a RequireJS ID?

/**
 * Chops module:// or /module/ so the path starts with the module name.
 *
 * @private
 * @param {String} url
 * @returns {String}
 */
function getModulePath(url) {
  if (url.match(MODULE_URL_REGEX)) {
    return url.replace(MODULE_URL_REGEX, '');
  }

  if (url.match(MODULE_ORD_REGEX)) {
    return url.replace(MODULE_ORD_REGEX, '');
  }

  if (url.match(NMODULE_REGEX)) {
    return url.replace(NMODULE_REGEX, '') + '.js';
  }
}

/**
 * @private
 * @typedef {Object} ModuleFileInfo
 * @property {String} [fullPath] `moduleName/path/to/file.js`
 * @property {String} [name] Niagara module name
 * @property {String} [path] File path inside the module jar
 */

module.exports = {
  /**
   * @param url
   * @returns {ModuleFileInfo}
   */
  getModuleFileInfo: function getModuleFileInfo(url) {
    const modulePath = getModulePath(url);
    
    if (typeof modulePath !== 'string') {
      return {};
    }

    const index = modulePath.indexOf('/');

    if (index <= 0) {
      throw new Error('could not determine module name: ' + modulePath);
    }

    return {
      fullPath: modulePath,
      name: modulePath.substring(0, index),
      path: modulePath.substring(index + 1)
    };
  },

  /**
   * @param {object} config
   * @returns {string|undefined} `niagara_home`
   */
  getNiagaraHome: function getNiagaraHome(config) {
    return (config && config.niagaraHome) || process.env.niagara_home;
  }
};