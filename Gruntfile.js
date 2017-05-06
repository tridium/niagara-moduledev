
module.exports = function runGrunt(grunt) {
  'use strict';

  var ALL_FILES = [ 'Gruntfile.js', 'lib/**/*.js', 'spec/**/*.js' ],
      JSHINT_OPTIONS = {
        curly: true,
        eqeqeq: true,
        esversion: 6,
        forin: true,
        immed: true,
        latedef: true,
        noarg: true,
        node: true,
        strict: true,
        undef: true,
        unused: true,

        globals: {
          afterEach: false,
          beforeEach: false,
          describe: false,
          expect: false,
          it: false,
          fit: false,
          jasmine: false,
          runs: false,
          waitsFor: false,
          xdescribe: false,
          xit: false,
          
          Promise: false
        }
      };

  grunt.initConfig({
    jasmine_nodejs: {
      options: {
        reporters: {
          console: {
            colors: true
          }
        }
      },
      all: {
        specs: [ 'spec/**/*.js' ]
      }
    },
    jsdoc: {
      dist: {
        src: ['lib/**/*.js', 'README.md'],
        options: {
          private: false,
          destination: 'doc',
          template: 'node_modules/ink-docstrap/template',
          configure: 'jsdoc.conf.json'
        }
      }
    },
    jshint: {
      files: ALL_FILES,
      options: JSHINT_OPTIONS
    },
    watch: {
      files: ALL_FILES,
      tasks: ['jshint', 'jasmine_nodejs']
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-jasmine-nodejs');
  grunt.loadNpmTasks('grunt-jsdoc');
};
