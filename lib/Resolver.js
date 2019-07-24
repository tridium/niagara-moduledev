'use strict';

//TODO: switch to node-unzip whenever https://github.com/nearinfinity/node-unzip/issues/16 is fixed
const path = require('path'),
      Promise = require('bluebird'),
      fs = Promise.promisifyAll(require('fs')),
      niagaraUtils = require('./util/niagara'),
      fileUtils = require('./util/file'),
      
      getModuleFileInfo = niagaraUtils.getModuleFileInfo,
      getNiagaraHome = niagaraUtils.getNiagaraHome,
      
      getTmpFileFromJarPath = fileUtils.getTmpFileFromJarPath,
  
      TEST_REGEX = /Test$/, // is this a test module?
      RUNTIME_PROFILES = [ '-ux', '-rt', '-wb', '-se', '' ];


/**
 * Responsible for translating `module://` and `/module/` requests into paths
 * to actual files. An instanceof this will be passed to the
 * {@link module:niagara-moduledev|fromFile() and fromRawString()} methods.
 *
 * @param {Object} reg Object literal mapping module names to source directories
 * on your hard drive
 * @param {Object} [config] Configuration object
 * @param {String} [config.niagaraHome=process.env.niagara_home]
 * `niagara_home` directory
 * @constructor
 */
function Resolver(reg, config) {
  const niagaraHome = getNiagaraHome(config),
        filePathCache = {};
  
  /**
   * Gets a path to a file on your hard drive, as determined by your
   * `moduledev.properties` configuration.
   *
   * @private
   * @param {ModuleFileInfo} modInfo module name and file path
   * @returns {Promise.<string>} promise to receive a path to file in a source
   * directory on your hard drive, as determined from `moduledev.properties`,
   * or reject if the requested module was not found in
   * `moduledev.properties`
   */
  function modulePathToModuleDev(modInfo) {
    if (typeof modInfo.path !== 'string') {
      return Promise.resolve();
    }

    let moduleName = getModuleName(modInfo),
        srcFolder = getSrcFolder(modInfo),
        modulePath = modInfo.path,
        profiles = RUNTIME_PROFILES,
        dir = reg[moduleName];
    
    if (!dir) {
      return Promise.reject(new Error('module ' + moduleName + ' not present in moduledev'));
    }
    
    function doResolve(modulePath) {
      return (function fromProfile(i) {
        if (i >= profiles.length) {
          return Promise.reject(new Error('could not find ' + modInfo.fullPath +
            ' in any JAR module'));
        }

        const filePath = path.join(
          dir, moduleName + profiles[i], srcFolder, modulePath);
        
        return verifyFileIsReadable(filePath).catch(() => fromProfile(i + 1));
      }(0));
    }
    return resolveModulePath(modulePath, doResolve);
  }


  /**
   * Search through all jars/runtime profiles in `niagara_home/modules` matching
   * the module name to find the file, extract it to a temporary dir, and
   * return the path to the temporary file.
   *
   * @private
   * @param {ModuleFileInfo} modInfo module name and desired
   * in-module file path
   * @returns {Promise.<string>} Promise to receive a String path to a file
   * extracted from the appropriate jar. Rejects if no module jar file could be
   * found.
   */
  function getTmpFileFromModuleInfo(modInfo) {
    let cached = filePathCache[modInfo.fullPath];
    if (cached) {
      return Promise.resolve(cached);
    }

    const moduleName = modInfo.name,
          modulePath = modInfo.path,
          fullModulePath = modInfo.fullPath,
          profiles = RUNTIME_PROFILES;

    if (!moduleName) {
      return Promise.reject(new Error('could not find module'));
    }

    function doResolve(modulePath) {
      return (function fromProfile(i) {
        if (i >= profiles.length) {
          return filePathCache[fullModulePath] || Promise.reject(
              new Error('could not find ' + fullModulePath + ' in any JAR module'));
        }

        const jarPath = path.resolve(
          niagaraHome + '/modules/' + moduleName + profiles[i] + '.jar');

        return getTmpFileFromJarPath(jarPath, moduleName, modulePath)
          .then(info => {
            filePathCache[fullModulePath] = info.path;
            if (info.isDirectory) {
              //continue to recursively populate the tmp directory with files
              //from all runtime profile modules.
              return fromProfile(i + 1);
            } else {
              return info.path;
            }
          })
          .catch(() => fromProfile(i + 1));
      }(0));
    }
    return resolveModulePath(modulePath, doResolve);
  }

  function urlToFilePath(url) {
    const modInfo = getModuleFileInfo(url);

    return modulePathToModuleDev(modInfo)
      .catch(function () {
        return getTmpFileFromModuleInfo(modInfo);
      });
  }

  function arrayToFilePath(arr) {
    return (function fromIndex(i) {
      if (i >= arr.length) {
        return Promise.reject(new Error("no valid entries in array " + arr.join()));
      }
      
      return urlToFilePath(arr[i]).catch(() => fromIndex(i + 1));
    }(0));
  }

  function toFilePath(url) {
    if (typeof url === 'string') {
      return urlToFilePath(url);
    } else if (Array.isArray(url)) {
      return arrayToFilePath(url);
    }
  }

  /**
   * Gets a usable path to a file on your hard drive, translated from the
   * given ORD or URL.
   *
   * If the file is inside a module specified in `moduledev.properties`, a
   * path to that file directly on your hard drive will be returned.
   *
   * Otherwise, the file will be extracted from the actual Niagara module
   * (in `niagara_home/modules`) and written to a temp file. A path to that
   * temp file will be returned.
   *
   * If the requested module is not in `moduledev.properties` or
   * `niagara_home/modules`, an error will be returned.
   *
   * @param {String} url A requested ORD to a file, either in `module://` or
   * `/module/` format.
   * @param {Function} callback A callback to receive a file path to the
   * requested file, or an error if the module or file could not be found.
   */
  this.getFilePath = function (url, callback) {
    toFilePath(url)
      .then(function (path) {
        callback(null, path);
      }, callback);
  };

  /**
   * Use this when performing a RequireJS optimization and you need to make use
   * of JS files in other Niagara modules. One common example is to use
   * Handlebars and related files in the `js` module to compile Handlebars
   * templates.
   * 
   * If your target is not a `.js` file, explicitly specify the file extension
   * of the actual file. The file extension will still be stripped out of the
   * RequireJS config.
   *
   * @param {object} paths a mapping of RequireJS aliases to `nmodule` module
   * IDs. Note that the file extension will be removed if present, as per
   * r.js optimization requirements. See example.
   * @param {Function} callback A callback to receive an object in which the
   * RequireJS module IDs have been mapped to file paths.
   *
   * @example
   * md.getRequireJsPaths({
   *   "Handlebars": "nmodule/js/rc/handlebars/handlebars-v4.0.6",
   *   "hbs": "nmodule/js/rc/require-handlebars-plugin/hbs",
   *   "underscore": "nmodule/js/rc/underscore/underscore",
   *   "myTemplate": "nmodule/myModule/rc/myTemplate.hbs"
   * }, function (paths) {
   *   _.extend(rjsConfig.paths, paths);
   *   continueRjsOptimization(rjsConfig);
   * });
   */
  this.getRequireJsPaths = function (paths, callback) {
    const result = {};
    Promise.all(Object.keys(paths).map(function (alias) {
      return toFilePath(paths[alias])
        .then(function (path) {
          result[alias] = stripExtension(path);
        });
    }))
      .then(function () {
        callback(null, result);
      }, callback);
  };
}

function getModuleName(modInfo) {
  let moduleName = modInfo.name,
      isTestModule = moduleName.match(TEST_REGEX);
  if (isTestModule) {
    return moduleName.replace(TEST_REGEX, '');
  } else {
    return moduleName;
  }
}

function getSrcFolder(modInfo) {
  return modInfo.name.match(TEST_REGEX) ? 'srcTest' : 'src';
}

function stripExtension(filePath) {
  return filePath.replace(/\.\w+$/, '');
}

function resolveModulePath(modulePath, doResolve) {
  //try and resolve without .js first
  if (modulePath.match(/\.js$/)) {
    return doResolve(stripExtension(modulePath))
      .catch(function () {
        return doResolve(modulePath);
      });
  } else {
    return doResolve(modulePath);
  }
}

function verifyFileIsReadable(filePath) {
  return fs.accessAsync(filePath, fs.constants.R_OK).then(() => filePath);
}

module.exports = Resolver;