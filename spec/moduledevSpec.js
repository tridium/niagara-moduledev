'use strict';

var moduledev = require('../lib/moduledev'),
    ModuleDev = moduledev.ModuleDev,
    properties = require('properties'),
    fs = require('fs'),
    path = require('path');


function matchPath(md, filePath, expected, cb) {
  md.getFilePath(filePath, function (err, result) {
    if (typeof expected === 'string') {
      expected = expected.replace(/\//g, path.sep);
    }
    expect(result).toBe(expected);
    cb();
  });
}


describe("niagara-moduledev", function () {
  var testFileName = "test-moduledev.properties",
      testProps = {
        bajaScript: 'spec/niagaraDevHome/bajaScript',
        bajaux: 'spec/niagaraDevHome/bajaux',
        mobile: 'spec/niagaraDevHome/mobile'
      },
      testPropsString = properties.stringify(testProps);
  
  beforeEach(function () {
    process.env.niagara_home = ".";
  });
      
  describe(".getDefaultFilePath()", function () {
    it("returns $niagara_home/etc/moduledev.properties", function () {
      var niagara_home = "/opt/niagara/whatever/",
          filename = niagara_home + "etc/moduledev.properties";
      process.env.niagara_home = niagara_home;
      expect(moduledev.getDefaultFilePath())
        .toBe(filename.replace(/\//g, path.sep));
    });
    
    it("uses passed niagaraHome if given", function () {
      var niagara_home = "/opt/niagara/whatever/",
          filename = niagara_home + "etc/moduledev.properties";
      process.env.niagara_home = "asdf";
      expect(moduledev.getDefaultFilePath({ niagaraHome: niagara_home }))
        .toBe(filename.replace(/\//g, path.sep));
    });
    
    it("returns null if niagara_home is not defined", function () {
      delete process.env.niagara_home;
      expect(moduledev.getDefaultFilePath()).toBe(null);
    });
  });

  describe(".fromRawString()", function () {
    it("reads and parses a raw properties string", function (done) {
      moduledev.fromRawString(testPropsString, function (err, md) {
        matchPath(md, "/module/bajaScript/rc/bajaScript-rt.js",
          testProps.bajaScript + "/bajaScript-rt/src/rc/bajaScript-rt.js", done);
      });
    });

    it("passes a ModuleDev instance to callback", function (done) {
      moduledev.fromRawString(testPropsString, function (err, md) {
        expect(md).toEqual(jasmine.any(ModuleDev));
        done();
      });
    });
  });

  describe(".fromFile()", function () {
    function verifyContents(md, cb) {
      matchPath(md, "/module/bajaScript/rc/bajaScript-rt.js",
        testProps.bajaScript + "/bajaScript-rt/src/rc/bajaScript-rt.js",
        cb);
    }
    
    beforeEach(function () {
      if (!fs.existsSync("etc")) { fs.mkdirSync("etc"); }
    });
    
    afterEach(function () {
      if (fs.existsSync("etc")) { fs.rmdirSync("etc"); }
    });
    
    it("reads and parses a properties file", function (done) {
      fs.writeFileSync(testFileName, testPropsString);
      moduledev.fromFile(testFileName, function (err, md) {
        verifyContents(md, function () {
          fs.unlinkSync(testFileName);
          done();
        });
      });
    });
    
    it("calls back error if niagara_home not present or given", function (done) {
      delete process.env.niagara_home;
      moduledev.fromFile(testFileName, function (err) {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    
    it("looks in niagara_home/etc/moduledev.properties by default", function (done) {
      var filePath = path.join(".", "etc", "moduledev.properties");
     fs.writeFileSync(filePath, testPropsString);
      process.env.niagara_home = ".";
      moduledev.fromFile(function (err, md) {
        verifyContents(md, function () {
          fs.unlinkSync(filePath);
          done();
        });
      });
    });

    it("passes a ModuleDev instance to callback", function (done) {
      fs.writeFileSync(testFileName, testPropsString);
      moduledev.fromFile(testFileName, function (err, md) {
        expect(md).toEqual(jasmine.any(ModuleDev));
        fs.unlinkSync(testFileName);
        done();
      });
    });

    it("passes a blank ModuleDev instance to callback if file not found", function (done) {
      moduledev.fromFile("nonexistent.properties", function (err, md) {
        expect(md).toEqual(jasmine.any(ModuleDev));
        matchPath(md, "/module/bajaScript/rc", undefined, done);
      });
    });
  });

  describe(".ModuleDev", function () {
    describe("#getFilePath()", function () {
      describe("for modules in moduledev.properties", function () {
        var md;

        beforeEach(function (done) {
          moduledev.fromRawString(testPropsString, function (err, m) {
            md = m;
            done();
          });
        });

        it("maps a module://moduleName ORD to a -ux module dir", function (done) {
          matchPath(md, "module://bajaScript/rc/bajaScript-ux.js",
            testProps.bajaScript + "/bajaScript-ux/src/rc/bajaScript-ux.js", done);
        });

        it("maps a module://moduleNameTest ORD to a file in /srcTest", function (done) {
          matchPath(md, "module://bajaScriptTest/rc/bajaScript-ux-spec.js",
            testProps.bajaScript + "/bajaScript-ux/srcTest/rc/bajaScript-ux-spec.js", done);
        });

        it("calls back undefined if the ORD is malformed", function (done) {
          matchPath(md, "module:/bajaux/rc/foo", undefined, done);
        });

        it("calls back undefined if the URI is malformed", function (done) {
          matchPath(md, "/moodule/bajaux/rc/foo", undefined, done);
        });
      });

      describe("for modules not in moduledev.properties", function () {
        var niagaraHome = 'spec/niagaraHome',
            md;

        beforeEach(function (done) {
          moduledev.fromRawString(testPropsString, {
            niagaraHome: niagaraHome
          }, function (err, m) {
            md = m;
            done();
          });
        });

        function verifyFileGeneration(md, filePath, expected, done) {
          md.getFilePath(filePath, function (err, filePath) {
            expect(err).toBeFalsy();
            fs.readFile(filePath, function (err, data) {
              expect(err).toBeFalsy();
              expect(String(data)).toBe(expected);
              done();
            });
          });
        }

        function verifyError(md, filePath, done) {
          md.getFilePath(filePath, function (err) {
            expect(err).toEqual(jasmine.any(Error));
            done();
          });
        }

        it("pulls a module:// file from a module in NIAGARA_HOME", function (done) {
          verifyFileGeneration(md, "module://testModule/rc/foo.js",
            'module.exports = "i am a foo";', done);
        });
        
        it("pulls a file from ux runtime profile", function (done) {
          verifyFileGeneration(md, "module://testModule/rc/ux-only.js",
            'module.exports = "i am ux only";', done);
        });
        
        it("pulls a file from rt runtime profile", function (done) {
          verifyFileGeneration(md, "module://testModule/rc/rt-only.js",
            'module.exports = "i am rt only";', done);
        });
        
        it("pulls a file from a module with no runtime profile", function (done) {
          verifyFileGeneration(md, "module://testModule/rc/no-profile.js",
            'module.exports = "i have no profile";', done);
        });

        it("pulls a /module/ URI from a module in NIAGARA_HOME", function (done) {
          verifyFileGeneration(md, "/module/testModule/rc/boo.js",
            'module.exports = "i am a boo";', done);
        });

        it("caches the file path so only pulled from zip once", function (done) {
          //use same instance for both...
          moduledev.fromRawString(testPropsString, {
            niagaraHome: niagaraHome
          }, function (err, md) {
            verifyFileGeneration(md, "/module/testModule/rc/boo.js",
              'module.exports = "i am a boo";', function () {
                verifyFileGeneration(md, "/module/testModule/rc/boo.js",
                  'module.exports = "i am a boo";', done);
              });
          });
        });
        
        it("calls back error if file not in module", function (done) {
          verifyError(md, "module://testModule/rc/nonexistent.js", done);
        });

        it("calls back error if module:// module not found", function (done) {
          verifyError(md, "module://totesNonexistent/rc/wevs", done);
        });

        it("calls back error if /module/ module not found", function (done) {
          verifyError(md, "/module/totesNonExistent/rc/nope", done);
        });
      });
    });
    
    describe(".getRequireJsPaths()", function () {
      var niagaraHome = 'spec/niagaraHome',
          md;

      beforeEach(function (done) {
        moduledev.fromRawString(testPropsString, {
          niagaraHome: niagaraHome
        }, function (err, m) {
          md = m;
          done();
        });
      });
      
      it("maps RequireJS IDs to file paths", function (done) {
        md.getRequireJsPaths({
          "bajaScript-rt": "nmodule/bajaScript/rc/bajaScript-rt",
          "foo": "nmodule/testModule/rc/foo"
        }, function (err, paths) {
          expect(String(fs.readFileSync(paths["bajaScript-rt"] + '.js')))
            .toBe('module.exports = "i am bajaScript-rt";');
          expect(String(fs.readFileSync(paths.foo + '.js')))
            .toBe('module.exports = "i am a foo";');
          done();
        });
      });
      
      it("respects an array for fallback behavior", function (done) {
        md.getRequireJsPaths({
          "bajaScript-rt": [
            "nmodule/bajaScript/rc/asdf.nope",
            "nmodule/bajaScript/rc/bajaScript-rt"
          ]
        }, function (err, paths) {
          expect(String(fs.readFileSync(paths["bajaScript-rt"] + '.js')))
            .toBe('module.exports = "i am bajaScript-rt";');
          done();
        });
      });
      
      it("calls back with error if file path not found", function (done) {
        md.getRequireJsPaths({
          "bajaScript-rt": "nmodule/bajaScript/rc/asdf.nope"
        }, function (err) {
          expect(err).toEqual(jasmine.any(Error));
          done();
        });
      });

      it("calls back with error if file path in array not found", function (done) {
        md.getRequireJsPaths({
          "bajaScript-rt": [
            "nmodule/bajaScript/rc/asdf.nope",
            "nmodule/bajaScript/rc/asdf.stillnope"
          ]
        }, function (err) {
          expect(err).toEqual(jasmine.any(Error));
          done();
        });
      });
    });
  });
});