var Filter = require('broccoli-filter');


module.exports = GroupedFilter

function GroupedFilter (inputTree, options) {
  Filter.call(this, inputTree, options)
}

// Prototyping this as a sub-class of broccoli-filter. However, in the long run
// this probably should just copy out the methods it needs (they way it relies on
// and pastes over existing methids is a bit gross)
GroupedFilter.prototype = Object.create(Filter.prototype);
GroupedFilter.prototype.constructor = GroupedFilter;


GroupedFilter.prototype.rebuild = function () {
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
    return self.processFilesInBatch(srcDir, destDir, this.filesToProcessInBatch);
  })
}

GroupedFilter.prototype.processFilesInBatch = function (srcDir, destDir, filesToProcess) {
  throw new Error("Need to implement processFilesInBatch()");
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
  return Promise.resolve(self.buildCacheInfoFor(srcDir, relativePath))
    .then(function (cacheInfo) {
      this.filesToProcessInBatch.push(relativePath);

      if (!cacheInfo) {
        throw new Error("No cachInfo returned from buildCacheInfoFor(" + relativePath + "). It is required");
      }

      if (!cacheInfo.inputFiles) {
        throw new Error("cachInfo returned from buildCacheInfoFor(" + relativePath + ") was missing inputFiles. You must manually specifiy the inputFiles for each processed file.");
      }

      if (!cacheInfo.outputFiles) {
        throw new Error("cachInfo returned from buildCacheInfoFor(" + relativePath + ") was missing outputFiles. You must manually specifiy the outputFiles for each processed file.");
      }

      return cacheInfo;
    })
}


GroupedFilter.prototype.getDestFilePath = function (relativePath) {
  throw new Error("getDestFilePath shoudn't be used in broccoli-grouped-filter")
}
