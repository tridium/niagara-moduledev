niagara-moduledev
==================

Translates web requests for Niagara module resources into absolute file
paths from moduledev.properties. Accepts either `/module/` URLs or
`module://` ORDs.

    var moduledev = require('niagara-moduledev'),
        path = 'd:\\niagara\\r40\\niagara_home\\etc\\moduledev.properties';
        
    moduledev.fromFile(path, function (err, md) {
      var url = '/module/bajaScript/rc/comm.js',
          ord = 'module://bajaScript/rc/sys.js';
      
      console.log(md.getFilePath(url));
      console.log(md.getFilePath(ord));
    });
