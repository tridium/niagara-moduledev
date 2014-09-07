
module.exports = function runGrunt(grunt) {
  'use strict';

  var ALL_FILES = [ 'Gruntfile.js', 'lib/**/*.js', 'spec/**/*.js' ],
      JSHINT_OPTIONS = {
        curly: true,
        eqeqeq: true,
        forin: true,
        immed: true,
        latedef: true,
        noarg: true,
        node: true,
        strict: true,
        undef: true,
        unused: true,

        globals: {
          beforeEach: false,
          describe: false,
          expect: false,
          it: false,
          jasmine: false,
          runs: false,
          waitsFor: false,
          xdescribe: false,
          xit: false
        }
      };

  grunt.initConfig({
    jasmine_node: {
      options: {
        forceExit: false,
        jUnit: {
          report: false,
          savePath: './build/reports/jasmine',
          useDotNotation: true,
          consolidate: true
        }
      },
      all: ['spec/']
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
      tasks: ['jshint', 'jasmine_node']
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-jasmine-node');
  grunt.loadNpmTasks('grunt-jsdoc');
};
