'use strict';

const AdmZip = require('adm-zip'),
      fs = require('fs'),
      path = require('path'),
      temp = require('temp').track();

module.exports = {
  getTmpFileFromJarPath: function getTmpFileFromJarPath(jarPath, modulePath) {
    return new Promise((resolve, reject) => {
      fs.access(jarPath, fs.constants.R_OK, function (err) {
        if (err) {
          return reject(new Error("cannot read zip file at " + jarPath));
        }
        resolve(module.exports.retrieveFromZip(jarPath, modulePath));
      });
    });
  },
  
  /**
   * Look inside the specified zip/jar file for a file matching the path. If
   * found, extract to a temp file and return a path to it.
   *
   * @private
   * @param {String} zipPath Path to zip/jar file
   * @param {String} filePath Path to file we are searching for inside the jar
   * @returns {Promise.<string>} Promise to receive a path to extracted file, or
   * error if the file was not not inside the jar
   */
  retrieveFromZip: function retrieveFromZip(zipPath, filePath) {
    let zip = new AdmZip(zipPath),
        entries = zip.getEntries(),
        entry,
        entryName,
        i;

    filePath = path.normalize(filePath);

    for (i = 0; i < entries.length; i++) {
      entry = entries[i];
      entryName = path.normalize(entry.entryName);

      if (entryName === filePath) {
        return module.exports.writeTempFile(entry.getData());
      }
    }

    return Promise.reject(new Error("could not retrieve " + filePath +
      " from zip " + zipPath));
  },
  
  /**
   * Write the extracted data out to a temporary file.
   *
   * @private
   * @param {Buffer} data Data read out from jar file
   * @returns {Promise.<string>} Promise to receive the path to the temporary
   * file, or reject if file could not be written
   */
  writeTempFile: function writeTempFile(data) {
    return new Promise(function (resolve, reject) {
      temp.open({ suffix: '.js' }, function (err, info) {
        if (err) {
          return reject(err);
        }

        fs.writeFile(info.path, data, function (err) {
          if (err) {
            return reject(err);
          }

          resolve(info.path);
        });
      });
    });
  }
};