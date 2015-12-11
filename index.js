var path = require('path');
var Filter = require('broccoli-persistent-filter');
var mkdirp = require('mkdirp')
var walkSync = require('walk-sync')
var mapSeries = require('promise-map-series')
var symlinkOrCopySync = require('symlink-or-copy').sync



module.exports = GroupedFilter

function GroupedFilter (inputTree, options) {
  Filter.call(this, inputTree, options)
}

// Prototyping this as a sub-class of broccoli-filter. However, in the long run
// this probably should just copy out the methods it needs (they way it relies on
// and pastes over existing methods is a bit gross)
GroupedFilter.prototype = Object.create(Filter.prototype);
GroupedFilter.prototype.constructor = GroupedFilter;


GroupedFilter.prototype.build = function () {
  var self = this

  this.filesToProcessInBatch = [];

  var paths = walkSync(this.inputPath);

  return mapSeries(paths, function (relativePath) {
    if (relativePath.slice(-1) === '/') {
      mkdirp.sync(self.outputPath + '/' + relativePath)
      mkdirp.sync(self.cachePath + '/' + relativePath)
    } else {
      if (self.canProcessFile(relativePath)) {
        return self.processAndCacheFile(self.inputPath, self.outputPath, relativePath)
      } else {
        symlinkOrCopySync(
          self.inputPath + '/' + relativePath, self.outputPath + '/' + relativePath)
      }
    }
  }).then(function() {
    return self.processFilesInBatch(self.inputPath, self.cachePath, self.filesToProcessInBatch);
  }).then(function (cacheInfosOfFilesToProcess) {
    self.symlinkOrCopyAllProcessedFilesToOutput(self.outputPath, self.filesToProcessInBatch, cacheInfosOfFilesToProcess);
  });
}

GroupedFilter.prototype.processFilesInBatch = function (srcDir, destDir, filesToProcess) {
  throw new Error("Need to implement processFilesInBatch(). Note, must return a cacheInfosOfFilesToProcess array (array of objects with inputFiles and outputFiles keys)");
}

GroupedFilter.prototype.canProcessFile = function (relativePath) {
  return this.hasDesiredExtension(relativePath) === true;
}

GroupedFilter.prototype.hasDesiredExtension = function (relativePath) {
  for (var i = 0; i < this.extensions.length; i++) {
    var ext = this.extensions[i]
    if (relativePath.slice(-ext.length - 1) === '.' + ext) {
      return true;
    }
  }
  return false;
}

GroupedFilter.prototype.processFile = function (srcDir, destDir, relativePath) {
  var self = this
  self.filesToProcessInBatch.push(relativePath);
}

GroupedFilter.prototype.symlinkOrCopyAllProcessedFilesToOutput = function (destDir, filesToProcess, cacheInfosOfFilesToProcess) {
  for (var i = 0; i < filesToProcess.length; i++) {
    var fileToProcess = filesToProcess[i],
        cacheInfo = cacheInfosOfFilesToProcess[i];

    this.symlinkOrCopyToOutput(fileToProcess, cacheInfo);
  }
}

GroupedFilter.prototype.symlinkOrCopyToOutput = function (relativePath, cacheInfo) {
  var cacheEntry = {
    inputFiles: (cacheInfo || {}).inputFiles,
    outputFiles: (cacheInfo || {}).outputFiles
  }

  for (var i = 0; i < cacheEntry.outputFiles.length; i++) {
    symlinkOrCopySync(
      this.cachePath + '/' + cacheEntry.outputFiles[i],
      this.outputPath + '/' + cacheEntry.outputFiles[i])
  }
  cacheEntry.hash = this.hashEntry(this.inputPath, this.outputPath, cacheEntry)
  this._cache[relativePath] = cacheEntry
}

// To do: Get rid of the srcDir/destDir args because we now have inputPath/outputPath
// https://github.com/search?q=processAndCacheFile&type=Code&utf8=%E2%9C%93

GroupedFilter.prototype.processAndCacheFile = function (srcDir, destDir, relativePath) {
  var self = this

  this._cache = this._cache || {}
  var cacheEntry = this._cache[relativePath]
  var persistedCacheEntry = this._persistedCache && this._persistedCache[relativePath]

  // First look in the in-memory cache and then look in the persistent cache on disk
  // (later during cleanup, the in-memory cache will be merged with the persistent
  // cache on the filesystem)

  if (cacheEntry != null && cacheEntry.hash === self.hashEntry(srcDir, destDir, cacheEntry)) {
    symlinkOrCopyFromCache(cacheEntry, self.cachePath)
  } else if (persistedCacheEntry != null && persistedCacheEntry.hash === self.hashEntry(srcDir, destDir, persistedCacheEntry)) {
    symlinkOrCopyFromCache(persistedCacheEntry, self.persistedCachePath)
  } else {
    return Promise.resolve()
      .then(function () {
        return self.processFile(srcDir, self.cachePath, relativePath)
      })
      .catch(function (err) {
        // Augment for helpful error reporting
        err.broccoliInfo = err.broccoliInfo || {}
        err.broccoliInfo.file = path.join(srcDir, relativePath)
        // Compatibility
        if (err.line != null) err.broccoliInfo.firstLine = err.line
        if (err.column != null) err.broccoliInfo.firstColumn = err.column
        throw err
      })
  }

  function symlinkOrCopyFromCache (cacheEntry, cachePath) {
    for (var i = 0; i < cacheEntry.outputFiles.length; i++) {
      var cachedRelativePath = cacheEntry.outputFiles[i]
      var dest = destDir + '/' + cachedRelativePath

      mkdirp.sync(path.dirname(dest))
      // We may be able to link as an optimization here, because we control
      // the cache directory; we need to be 100% sure though that we don't try
      // to hardlink symlinks, as that can lead to directory hardlinks on OS X
      symlinkOrCopySync(
        cachePath + '/' + cachedRelativePath, dest)
    }
  }

}

GroupedFilter.prototype.getDestFilePath = function (relativePath) {
  throw new Error("getDestFilePath shoudn't be used in broccoli-grouped-filter")
}
