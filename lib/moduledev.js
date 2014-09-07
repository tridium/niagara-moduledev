/*jshint node: true */


/**
 * Parses `moduledev.properties` and translates web requests
 * and ORDs to module resources to absolute file paths.
 *
 * If the requested module is not configured in `moduledev.properties`, it will
 * look for the actual jar file in `NIAGARA_HOME/modules` and extract the
 * requested file to a temp file. The path to that temp file will be returned.
 *
 * @module niagara-moduledev
 * @author Logan Byam
 * @version 0.1.2
 * @license Copyright 2013, Tridium, Inc. All Rights Reserved.
 * 
 * @example

var moduledev = require('niagara-moduledev');

moduledev.fromFile('path/to/moduledev.properties', function (err, md) {
  var url = '/module/bajaScript/rc/virt.js',
      ord = 'module://bajaScript/rc/coll.js';

  md.getFilePath(url, function (err, filePath) {
    console.log(fs.readFileSync(filePath));
  });

  md.getFilePath(ord, function (err, filePath) {
    console.log(fs.readFileSync(filePath));
  });
});

 */

'use strict';

var properties = require('properties'),
    fs = require('fs'),
    path = require('path'),
    tmp = require('temporary'),

    //TODO: switch to node-unzip whenever https://github.com/nearinfinity/node-unzip/issues/16 is fixed
    AdmZip = require('adm-zip'),

    tempFiles = [],

    TEST_REGEX = /Test$/, // is this a test module?
    MODULE_URL_REGEX = /^\/module\//, //is this a URL request for /module/?
    MODULE_ORD_REGEX = /^module:\/\//; //is this a module:// ORD?

process.on('exit', function () {
  //console.log('Process exiting - niagara-moduledev cleaning up temp files');
  tempFiles.forEach(function (tmp) {
    if (typeof tmp.unlinkSync === 'function') {
      try {
        tmp.unlinkSync();
      } catch (e) {
        console.error(e);
      }
    }
  });
});


/**
 * Responsible for translating `module://` and `/module/` requests into paths
 * to actual files. An instanceof this will be passed to the
 * {@link module:niagara-moduledev|fromFile() and fromRawString()} methods.
 *
 * @param {Object} reg Object literal mapping module names to source directories
 * on your hard drive
 * @param {Object} [config] Configuration object
 * @param {String} [config.niagaraHome=process.env.NIAGARA_HOME]
 * NIAGARA_HOME directory
 * @constructor
 */
function ModuleDev(reg, config) {
  var niagaraHome = config.niagaraHome || process.env.NIAGARA_HOME,
      filePathCache = {};

  /**
   * @inner
   * @private
   * @typedef {Object} ModuleDev~ModuleFileInfo
   * @property {String} fullPath `moduleName/path/to/file.js`
   * @property {String} name Niagara module name
   * @property {String} path File path inside the module jar
   */

  function getModuleFileInfo(modulePath) {
    if (typeof modulePath !== 'string') {
      return {};
    }

    var index = modulePath.indexOf('/');

    if (index <= 0) {
      throw 'could not determine module name: ' + modulePath;
    }

    return {
      fullPath: modulePath,
      name: modulePath.substring(0, index),
      path: modulePath.substring(index + 1)
    };
  }

  /**
   * Gets a path to a file on your hard drive, as determined by your
   * `moduledev.properties` configuration.
   *
   * @inner
   * @private
   * @param {ModuleDev~ModuleFileInfo} modInfo module name and file path
   * @returns {String} Path to file in a source directory on your hard drive,
   * as determined from `moduledev.properties`, or undefined if the requested
   * module was not found in `moduledev.properties`
   */
  function modulePathToModuleDev(modInfo) {
    if (typeof modInfo.path !== 'string') {
      return;
    }

    var moduleName = modInfo.name,
        filePath = modInfo.path,
        isTestModule = moduleName.match(TEST_REGEX),
        srcFolder = isTestModule ? 'srcTest/' : 'src/',
        actualModuleName,
        dir;

    if (isTestModule) {
      actualModuleName = moduleName.replace(TEST_REGEX, '');
    } else {
      actualModuleName = moduleName;
    }

    dir = reg[actualModuleName];

    if (dir) {
      return dir + '/' + srcFolder + filePath;
    }
  }

  /**
   * Chops module:// or /module/ so the path starts with the module name.
   *
   * @inner
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
  }

  /**
   * Write the extracted data out to a temporary file.
   *
   * @inner
   * @private
   * @param {Buffer} data Data read out from jar file
   * @param {Function} cb Callback to receive the path to the temporary file,
   * or error if file could not be written
   */
  function writeTempFile(data, cb) {
    var file = new tmp.File();

    fs.writeFile(file.path, data, function (err) {
      if (err) {
        return cb(err);
      }

      tempFiles.push(file);

      cb(null, file.path);
    });
  }

  /**
   * Look inside the specified zip/jar file for a file matching the path. If
   * found, extract to a temp file and return a path to it.
   *
   * @inner
   * @private
   * @param {String} zipPath Path to zip/jar file
   * @param {String} filePath Path to file we are searching for inside the jar
   * @param {Function} cb Callback to receive a path to extracted file, or
   * error if the file was not not inside the jar
   */
  function retrieveFromZip(zipPath, filePath, cb) {
    var zip = new AdmZip(zipPath),
        entries = zip.getEntries(),
        entry,
        entryName,
        i;

    filePath = path.normalize(filePath);

    for (i = 0; i < entries.length; i++) {
      entry = entries[i];
      entryName = path.normalize(entry.entryName);

      if (entryName === filePath) {
        return writeTempFile(entry.getData(), cb);
      }
    }

    cb(new Error("could not retrieve " + filePath + " from zip " + zipPath));
  }


  /**
   * Extract a file from the appropriate jar in NIAGARA_HOME, write to a
   * temporary dir, and return the path to the temporary file.
   *
   * @inner
   * @private
   * @param {String} modulePath module path in the form of
   * `moduleName/path/to/file.js`
   * @param {Function} cb Callback to receive a String path to a file extracted
   * from the appropriate jar. Receives error if no module jar file could be
   * found.
   */
  function getTmpFileFromJarPath(modInfo, cb) {
    var cached = filePathCache[modInfo.fullPath];
    if (cached) {
      return cb(null, cached);
    }

    if (!modInfo.name) {
      return cb('could not find module');
    }

    var moduleJarPath = path.resolve(
        niagaraHome + '/modules/' + modInfo.name + '.jar');

    if (fs.existsSync(moduleJarPath)) {
      retrieveFromZip(moduleJarPath, modInfo.path, function (err, tempPath) {
        if (err) {
          return cb(err);
        }

        filePathCache[modInfo.fullPath] = tempPath;

        return cb(null, tempPath);
      });
    } else {
      return cb(new Error("zip file not found at " + moduleJarPath));
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
   * (in `NIAGARA_HOME/modules`) and written to a temp file. A path to that
   * temp file will be returned.
   *
   * If the requested module is not in `moduledev.properties` or
   * `NIAGARA_HOME/modules`, an error will be returned.
   *
   * @param {String} url A requested ORD to a file, either in `module://` or
   * `/module/` format.
   * @param {Function} callback A callback to receive a file path to the
   * requested file, or an error if the module or file could not be found.
   */
  this.getFilePath = function (url, callback) {
    var modulePath = getModulePath(url),
        modInfo = getModuleFileInfo(modulePath),
        moduleDevPath = modulePathToModuleDev(modInfo);

    if (moduleDevPath) {
      return callback(null, moduleDevPath);
    }

    return getTmpFileFromJarPath(modInfo, callback);
  };
}

/**
 * Parses a raw string (in Java properties format) into a ModuleDev instance.
 *
 * @param {String} str Properties string, in the form expected by `moduledev.properties`
 * @param {Object} [config] configuration object
 * @param {String} [config.niagaraHome=process.env.NIAGARA_HOME] Niagara home
 * directory - look in here for `/modules/`
 * @param {Function} callback Callback to receive {@link ModuleDev} instance
 */
exports.fromRawString = function (str, config, callback) {
  //shuffle arguments
  if (arguments.length === 2) {
    callback = config;
    config = {};
  }

  if (!str) {
    return callback("properties string must be provided");
  }

  var reg;

  try {
    reg = properties.parse(str);
  } catch (err) {
    console.error("Could not parse raw property string " + str + ". " +
      "No moduledev resolution will occur.");
    reg = {};
  }

  return callback(null, new ModuleDev(reg, config));
};

/**
 * Parses a `moduledev.properties` into a ModuleDev instance.
 *
 * @param {String} fileName Path to `moduledev.properties` (or other file in
 * proper format)
 * @param {Object} [config] configuration object
 * @param {String} [config.niagaraHome=process.env.NIAGARA_HOME] Niagara home
 * directory - look in here for `/modules/`
 * @param {Function} callback Callback to receive
 * {@link module:niagara-moduledev~ModuleDev} instance
 */
exports.fromFile = function(fileName, config, callback) {
  //shuffle arguments
  if (arguments.length === 2) {
    callback = config;
    config = {};
  }
  
  if (!fileName) {
    return callback("file name must be provided");
  }
  
  fs.readFile(fileName, function (err, data) {

    if (err) {
      console.log("File at " + fileName + " could " +
        "not be loaded. No moduledev resolution will occur.");

      return callback(null, new ModuleDev({}, config));
    }
    
    properties.parse(String(data), function (err, result) {
      var reg;

      if (err) {
        reg = {};
      } else {
        reg = result;
      }

      callback(null, new ModuleDev(reg, config));
    });
  });

};

exports.ModuleDev = ModuleDev;
