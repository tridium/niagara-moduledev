niagara-moduledev
==================

Translates web requests for Niagara module resources into absolute file
paths from `moduledev.properties`. Accepts either `/module/` URLs or
`module://` ORDs.

    var moduledev = require('niagara-moduledev'),
        path = 'd:\\niagara\\r43\\niagara_home\\etc\\moduledev.properties';
        
    moduledev.fromFile(path, function (err, md) {
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
