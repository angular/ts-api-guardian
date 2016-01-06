require('source-map-support').install();

var fs = require('fs');
var gulp = require('gulp');
var merge = require('merge2');
var sourcemaps = require('gulp-sourcemaps');
var ts = require('gulp-typescript');
var typescript = require('typescript');
var mocha = require('gulp-mocha');

var hasError;
var failOnError = false;

var onError = function(err) {
  hasError = true;
  if (failOnError) {
    process.exit(1);
  }
};

var tsProject =
    ts.createProject('tsconfig.json', {noEmit: false, declaration: true, typescript: typescript});

gulp.task('compile', function() {
  hasError = false;
  var tsResult =
      gulp.src(['lib/**/*.ts', 'typings/**/*.d.ts', 'node_modules/typescript/lib/typescript.d.ts'])
          .pipe(sourcemaps.init())
          .pipe(ts(tsProject))
          .on('error', onError);
  return merge([
    tsResult.dts.pipe(gulp.dest('build/definitions')),
    // Write external sourcemap next to the js file
    tsResult.js.pipe(sourcemaps.write('.')).pipe(gulp.dest('build/lib')),
    tsResult.js.pipe(gulp.dest('build/lib'))
  ]);
});

gulp.task('test.compile', ['compile'], function(done) {
  if (hasError) {
    done();
    return;
  }
  return gulp.src(['test/*.ts', 'typings/**/*.d.ts'], {base: '.'})
      .pipe(sourcemaps.init())
      .pipe(ts(tsProject))
      .on('error', onError)
      .js.pipe(sourcemaps.write())
      .pipe(gulp.dest('build/'));  // '/test/' comes from base above.
});

gulp.task('test.unit', ['test.compile'], function(done) {
  if (hasError) {
    done();
    return;
  }
  return gulp.src('build/test/**/*.js').pipe(mocha({
    timeout: 4000  // Needed by the type-based tests :-(
  }))
});

gulp.task('watch', ['test.unit'], function() {
  failOnError = false;
  // Avoid watching generated .d.ts in the build (aka output) directory.
  return gulp.watch(['lib/**/*.ts', 'test/**/*.ts'], {ignoreInitial: true}, ['test.unit']);
});

gulp.task('default', ['compile']);