/*jshint node: true */


/**
 * Parses `moduledev.properties` and translates web requests
 * and ORDs to module resources to absolute file paths.
 *
 * If the requested module is not configured in `moduledev.properties`, it will
 * look for the actual jar file in `niagara_home/modules` and extract the
 * requested file to a temp file. The path to that temp file will be returned.
 *
 * @module niagara-moduledev
 * @author Logan Byam
 * @version 0.1.3
 * @license Copyright 2017, Tridium, Inc. All Rights Reserved.
 * 
 * @example

var moduledev = require('niagara-moduledev');

moduledev.fromFile('path/to/moduledev.properties', function (err, md) {
  var url = '/module/bajaScript/rc/virt.js',
      ord = 'module://bajaScript/rc/coll.js',
      notFound = '/module/blahjaSkript/rc/nope.js';

  md.getFilePath(url, function (err, filePath) {
    console.log(String(fs.readFileSync(filePath)));
  });

  md.getFilePath(ord, function (err, filePath) {
    console.log(String(fs.readFileSync(filePath)));
  });
  
  md.getFilePath(notFound, function (err, filePath) {
    console.error(err);
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
    MODULE_ORD_REGEX = /^module:\/\//, //is this a module:// ORD?
    RUNTIME_PROFILES = [ '-ux', '-rt', '-wb', '-se', '' ];

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

function getNiagaraHome(config) {
  return (config && config.niagaraHome) || process.env.niagara_home;
}


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
function ModuleDev(reg, config) {
  var niagaraHome = getNiagaraHome(config),
      filePathCache = {};

  /**
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
   * @private
   * @param {ModuleDev~ModuleFileInfo} modInfo module name and file path
   * @param {Function} cb callback to receive a path to file in a source
   * directory on your hard drive, as determined from `moduledev.properties`,
   * or undefined if the requested module was not found in
   * `moduledev.properties`
   */
  function modulePathToModuleDev(modInfo, cb) {
    if (typeof modInfo.path !== 'string') {
      return cb(null);
    }

    var moduleName = modInfo.name,
        modulePath = modInfo.path,
        isTestModule = moduleName.match(TEST_REGEX),
        srcFolder = isTestModule ? 'srcTest/' : 'src/',
        actualModuleName,
        profiles = RUNTIME_PROFILES,
        dir;

    if (isTestModule) {
      actualModuleName = moduleName.replace(TEST_REGEX, '');
    } else {
      actualModuleName = moduleName;
    }

    dir = reg[actualModuleName];
    
    if (!dir) {
      return cb(null, undefined);
    }
    
    (function fromProfile(i) {
      if (i >= profiles.length) {
        return cb(new Error('could not find ' + modInfo.fullPath +
          ' in any JAR module'));
      }
      
      var filePath = path.join(dir, actualModuleName + profiles[i], srcFolder,
        modulePath);
      
      fs.access(filePath, fs.constants.R_OK, function (err) {
        if (err) {
          return fromProfile(i + 1);
        }
        return cb(null, filePath);
      });
    }(0));
  }

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
  }

  /**
   * Write the extracted data out to a temporary file.
   *
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
  
  function getTmpFileFromJarPath(jarPath, modulePath, cb) {
    fs.access(jarPath, fs.constants.R_OK, function (err) {
      if (err) {
        return cb(new Error("cannot read zip file at " + jarPath));
      }
      retrieveFromZip(jarPath, modulePath, cb);
    });
  }
  

  /**
   * Search through all jars/runtime profiles in `niagara_home/modules` matching
   * the module name to find the file, extract it to a temporary dir, and
   * return the path to the temporary file.
   *
   * @private
   * @param {ModuleDev~ModuleFileInfo} modInfo module name and desired
   * in-module file path
   * @param {Function} cb Callback to receive a String path to a file extracted
   * from the appropriate jar. Receives error if no module jar file could be
   * found.
   */
  function getTmpFileFromModuleInfo(modInfo, cb) {
    var cached = filePathCache[modInfo.fullPath];
    if (cached) {
      return cb(null, cached);
    }
    
    var moduleName = modInfo.name,
        modulePath = modInfo.path,
        fullModulePath = modInfo.fullPath,
        profiles = RUNTIME_PROFILES;
    
    if (!moduleName) {
      return cb('could not find module');
    }
    
    function fromProfile(i) {
      if (i >= profiles.length) {
        return cb(new Error('could not find ' + modInfo.fullPath +
          ' in any JAR module'));
      }
      
      var jarPath = path.resolve(
          niagaraHome + '/modules/' + moduleName + profiles[i] + '.jar');
      getTmpFileFromJarPath(jarPath, modulePath, function (err, tempPath) {
        if (err) {
          return fromProfile(i + 1);
        }
        
        filePathCache[fullModulePath] = tempPath;
        
        return cb(null, tempPath);
      });
    }

    fromProfile(0);
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
    var modulePath = getModulePath(url),
        modInfo = getModuleFileInfo(modulePath);
    
    
    
    modulePathToModuleDev(modInfo, function (err, path) {
      if (path) {
        return callback(null, path);
      }
      return getTmpFileFromModuleInfo(modInfo, callback);
    });
  };
}

/**
 * Parses a raw string (in Java properties format) into a ModuleDev instance.
 *
 * @param {String} str Properties string, in the form expected by `moduledev.properties`
 * @param {Object} [config] configuration object
 * @param {String} [config.niagaraHome=process.env.niagara_home] Niagara home
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
 * @param {String} [fileName=$niagara_home/etc/moduledev.properties] Path to
 * `moduledev.properties` (or other file in proper format)
 * @param {Object} [config] configuration object
 * @param {String} [config.niagaraHome=process.env.niagara_home] Niagara home
 * directory - look in here for `/modules/`
 * @param {Function} callback Callback to receive
 * {@link module:niagara-moduledev~ModuleDev} instance
 */
exports.fromFile = function(fileName, config, callback) {
  //shuffle arguments
  if (arguments.length === 2) {
    callback = config;
    config = {};
  } else if (arguments.length === 1) {
    callback = fileName;
    config = {};
    fileName = exports.getDefaultFilePath();
  }
  
  if (!fileName) {
    return callback(new Error("file name must be provided"));
  }
  
  if (!getNiagaraHome(config)) {
    return callback(new Error("niagara_home could not be determined"));
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

/**
 * Get the default file path to `moduledev.properties` at
 * `$niagara_home/etc/moduledev.properties`.
 * @param {object} [config]
 * @param {string} [config.niagaraHome=process.env.niagara_home] the
 * `niagara_home` path if you already have it
 * @returns {string|null} The default path to `moduledev.properties`, or `null`
 * if it could not be determined
 */
exports.getDefaultFilePath = function (config) {
  var niagaraHome = getNiagaraHome(config);
  if (niagaraHome) {
    return path.join(niagaraHome, "etc/moduledev.properties");
  }
  return null;
};

exports.ModuleDev = ModuleDev;
