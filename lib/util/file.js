'use strict';

const AdmZip = require('adm-zip'),
      Promise = require('bluebird'),
      fs = Promise.promisifyAll(require('fs-extra')),
      path = require('path'),
      temp = require('temp');

if (!process.env.RETAIN_TEMP_FILES) { temp.track(); }

const mkdirAsync = Promise.promisify(temp.mkdir);

/**
 * @typedef {Object} FileInfo
 * @property {string} path
 * @property {boolean} isDirectory
 */


let tmpDir;
function getTmpDir() {
  return tmpDir || (tmpDir = mkdirAsync({ prefix: 'niagara-moduledev' }));
}

/**
 * Look inside the specified zip/jar file for a file matching the path. If
 * found, extract to a temp file and return a path to it.
 *
 * @param {String} zipPath Path to zip/jar file
 * @param {string} moduleName
 * @param {String} filePath Path to file we are searching for inside the jar
 * @returns {Promise.<string>} Promise to receive a path to extracted file, or
 * error if the file was not not inside the jar
 */
function retrieveFromZip(zipPath, moduleName, filePath) {
  let zip = new AdmZip(zipPath),
      entries = zip.getEntries(),
      entry,
      entryName,
      i;

  filePath = normalized(filePath);

  for (i = 0; i < entries.length; i++) {
    entry = entries[i];
    entryName = entry.entryName;
    if (normalized(entryName) === filePath) {
      if (entry.isDirectory) {
        return writeTempDirectory(zip, moduleName, entryName);
      } else {
        return writeTempFile(zip, moduleName, entryName);
      }
    }
  }

  return Promise.reject(new Error("could not retrieve " + filePath +
    " from zip " + zipPath));
}

/**
 * Write the extracted data out to a temporary file.
 *
 * @param {AdmZip} zip
 * @param {string} moduleName
 * @param {string} entryName
 * @returns {Promise.<FileInfo>} Promise to receive the info for the temporary
 * file, or reject if file could not be written
 */
function writeTempFile(zip, moduleName, entryName) {
  return getTmpDir()
    .then(dirPath => {
      let filePath = path.join(dirPath, moduleName, entryName);
      return fs.ensureFileAsync(filePath)
        .then(() => fs.writeFileAsync(filePath, zip.getEntry(entryName).getData()))
        .then(() => ({ path: filePath, isDirectory: false }));
    });
}

/**
 * Extract an entire directory from a zip file to a temp dir.
 *
 * @param {AdmZip} zip
 * @param {string} moduleName
 * @param {string} entryName
 * @returns {Promise.<FileInfo>} Promise to receive the info for the temporary
 * directory, or reject if directory could not be written
 */
function writeTempDirectory(zip, moduleName, entryName) {
  return getTmpDir()
    .then(dirPath => {
      let modulePath = normalized(path.join(dirPath, moduleName, entryName));
      zip.extractEntryTo(
        entryName,
        modulePath,
        false,
        false
      );
      return {
        path: modulePath,
        isDirectory: true
      };
    });
}

function normalized(filePath) {
  //support retrieving both files and directories directly
  return path.normalize(filePath).replace(/[\/\\]$/, '');
}


module.exports = {
  getTmpFileFromJarPath: function getTmpFileFromJarPath(jarPath, moduleName, modulePath) {
    return fs.accessAsync(jarPath, fs.constants.R_OK)
      .then(() => retrieveFromZip(jarPath, moduleName, modulePath))
      .catch(() => { throw new Error("cannot read zip file at " + jarPath); });
  }
};