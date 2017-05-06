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

const Resolver = require('./Resolver'),
      niagaraUtils = require('./util/niagara'),
      properties = require('properties'),
      fs = require('fs'),
      path = require('path'),
  
      getNiagaraHome = niagaraUtils.getNiagaraHome;

/**
 * Parses a raw string (in Java properties format) into a ModuleDev instance.
 *
 * @param {String} str Properties string, in the form expected by `moduledev.properties`
 * @param {Object} [config] configuration object
 * @param {String} [config.niagaraHome=process.env.niagara_home] Niagara home
 * directory - look in here for `/modules/`
 * @param {Function} callback Callback to receive {@link Resolver} instance
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

  let reg;

  try {
    reg = properties.parse(str);
  } catch (err) {
    console.error("Could not parse raw property string " + str + ". " +
      "No moduledev resolution will occur.");
    reg = {};
  }

  return callback(null, new Resolver(reg, config));
};

/**
 * Parses a `moduledev.properties` into a ModuleDev instance.
 *
 * @param {String} [fileName=$niagara_home/etc/moduledev.properties] Path to
 * `moduledev.properties` (or other file inproper format)
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

      return callback(null, new Resolver({}, config));
    }
    
    properties.parse(String(data), function (err, result) {
      const reg = err ? {} : result;
      callback(null, new Resolver(reg, config));
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
  const niagaraHome = getNiagaraHome(config);
  if (niagaraHome) {
    return path.join(niagaraHome, "etc/moduledev.properties");
  }
  return null;
};

exports.ModuleDev = Resolver;
