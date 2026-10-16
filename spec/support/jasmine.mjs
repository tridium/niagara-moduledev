export default {
  spec_dir: "spec",
  spec_files: [
    "moduledevSpec.js"
  ],
  helpers: [
    "helpers/**/*.?(m)js"
  ],
  env: {
    stopSpecOnExpectationFailure: false,
    random: false
  }
}
