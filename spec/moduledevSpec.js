'use strict';

var moduledev = require('../lib/moduledev'),
    ModuleDev = moduledev.ModuleDev,
    properties = require('properties'),
    fs = require('fs'),
    path = require('path');


function matchPath(md, path, expected, cb) {
  md.getFilePath(path, function (err, result) {
    expect(result).toBe(expected);
    cb();
  });
}


describe("niagara-moduledev", function () {
  var testFileName = "test-moduledev.properties",
      testProps = {
        bajaScript: 'd:/niagara/r40/niagara_dev_home/fw/bajaScript',
        bajaux: 'd:/niagara/r40/niagara_dev_home/fw/bajaux',
        mobile: 'd:/niagara/r40/niagara_dev_home/util/mobile'
      },
      testPropsString = properties.stringify(testProps);
      
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
        matchPath(md, "/module/bajaScript/rc",
          testProps.bajaScript + "/src/rc", done);
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
      matchPath(md, "/module/bajaScript/rc", testProps.bajaScript + "/src/rc",
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

        it("maps a module://moduleName ORD to a file in /src", function (done) {
          matchPath(md, "module://bajaux/rc/foo",
            testProps.bajaux + "/src/rc/foo", done);
        });

        it("maps a module://moduleNameTest ORD to a file in /srcTest", function (done) {
          matchPath(md, "module://bajauxTest/rc/boo",
            testProps.bajaux + "/srcTest/rc/boo", done);
        });

        it("maps a /module/moduleName URI to a file in /src", function (done) {
          matchPath(md, "/module/mobile/rc/doo",
            testProps.mobile + "/src/rc/doo", done);
        });

        it("maps a /module/moduleNameTest URI to a file in /srcTest", function (done) {
          matchPath(md, "/module/mobileTest/rc/goo",
            testProps.mobile + "/srcTest/rc/goo", done);
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
  });
});