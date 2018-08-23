'use strict';

const fs          = require('fs');
const os          = require('os');
const tmp         = require('tmp');
const child       = require('child_process');
const Promise     = require('bluebird');
const PassThrough = require('stream').PassThrough;
const shellescape = require('shell-escape');

const execFile  = Promise.promisify(child.execFile);
const exec      = Promise.promisify(child.exec);
const readFile  = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);

const isWindows = os.platform() === 'win32';

module.exports = (files, options) => new Promise((resolve, reject) => {
  if(!Array.isArray(files)) 
    return reject(new TypeError('Expected files to be an array of paths to PDF files.'));

  files = files.filter((file) => typeof file === typeof '');

  if(files.length === 0) 
    return reject(new Error('No files were submitted for merging.'));

  if(files.length === 1)
    readFile(files[0])
    .then((buffer) => {
      return resolve(output(buffer));
    })
    .catch(reject);

  options = Object.assign({
    libPath: 'pdftk',
    output:  Buffer,
  }, options);

  const tmpFilePath = isWindows
    ? tmp.tmpNameSync()
    : shellescape([tmp.tmpNameSync()]);

  const args = files.map((file) =>
    isWindows
      ? `"${file}"`
      : shellescape([file.replace(/\\/g, '/')])
  ).concat(['cat', 'output', tmpFilePath]);

  if (options.execOptions) {
    args.push(options.execOptions);
  }

  const childPromise = (isWindows && options.libPath !== 'pdftk')
    ? execFile(options.libPath, args)
    : exec(`${options.libPath} ${args.join(' ')}`);

  const output = (buffer) => {
    if(options.output === Buffer || String(options.output).toUpperCase() === 'BUFFER') {
      return buffer;
    }

    if(options.output === PassThrough || ['STREAM', 'READSTREAM'].indexOf(String(options.output).toUpperCase()) !== -1) {
      const stream = new PassThrough();

      stream.end(buffer);

      return stream;
    }

    return writeFile(options.output, buffer)
      .then(() => buffer);
  }

  if(files.length > 1)
    childPromise
      .then(() =>
        readFile(tmpFilePath)
      )
      .then((buffer) =>
        new Promise((resolve) => {
          fs.unlink(tmpFilePath, () => resolve(buffer));
        })
      )
      .then((buffer) => {
        return output(buffer);
      })
      .then(resolve)
      .catch(reject);
});
