const gulp = require('gulp');
const ts = require('gulp-typescript');
const mocha = require('gulp-mocha');

const tsProject = ts.createProject('./test/tsconfig.json');
gulp.task('test', () => {
  return gulp.src('./test/**/*.ts', { base: '.' })
    .pipe(tsProject())
    .pipe(gulp.dest('.'))
    .pipe(mocha({ reporter: 'spec' }));
});

gulp.task('test:watch', ['test'], () => {
  gulp.watch('./test/**/*.ts', ['test']);
});

gulp.task('default', ['test']);
