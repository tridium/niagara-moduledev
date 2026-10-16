<a name="0.2.0"></a>
## 0.2.0 (2019/07/25)

Begin prioritizing files in the `build` directory over those in the `src`
directory. If the same file exists in `src` and `build/src`, the file in
`build/src` will be used.

Use `niagara-moduledev` 0.2.x if you are using `grunt-niagara` 2.x, which will
transpile ES6 code from `src` into `build/src`.

<a name="0.1.10"></a>
## 0.1.10 (2019/07/25)

Last release before prioritizing the `build` directory. This version will
continue to only resolve files directly out of the `src` directory. 

Use `niagara-moduledev` 0.1.x if you are using `grunt-niagara` 1.x and not
transpiling ES6 code into `build`.
