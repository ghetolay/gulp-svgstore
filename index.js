var cheerio = require('cheerio')
var path = require('path')
var gutil = require('gulp-util')
var Stream = require('stream')

module.exports = function (config) {

  config = config || {}

  var namespaces = {}
  var isEmpty = true
  var fileName
  var inlineSvg = config.inlineSvg || false
  var ids = {}

  var resultSvg = '<svg xmlns="http://www.w3.org/2000/svg"><defs/></svg>'
  if (!inlineSvg) {
    resultSvg =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" ' +
      '"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' +
      resultSvg
  }

  var $ = cheerio.load(resultSvg, { xmlMode: true })
  var $combinedSvg = $('svg')
  var $combinedDefs = $('defs')
  var stream = new Stream.Transform({ objectMode: true })

  stream._transform = function transform (file, encoding, cb) {

    if (file.isStream()) {
      return cb(new gutil.PluginError('gulp-svgstore', 'Streams are not supported!'))
    }

    if (!file.cheerio) {
      file.cheerio = cheerio.load(file.contents.toString(), { xmlMode: true })
    }

    var $svg = file.cheerio('svg')
    if($svg.length < 1){
      return cb()//not an svg file apparently
    }

    var idAttr = path.basename(file.relative, path.extname(file.relative))
    var viewBoxAttr = $svg.attr('viewBox')
    var $symbol = $('<symbol/>')

    if (idAttr in ids) {
      return cb(new gutil.PluginError('gulp-svgstore', 'File name should be unique: ' + idAttr))
    }

    ids[idAttr] = true

    if (!fileName) {
      fileName = path.basename(file.base)
      if (fileName === '.' || !fileName) {
        fileName = 'svgstore.svg'
      } else {
        fileName = fileName.split(path.sep).shift() + '.svg'
      }
    }

    if (file && isEmpty) {
      isEmpty = false
    }

    $symbol.attr('id', idAttr)
    if (viewBoxAttr) {
      $symbol.attr('viewBox', viewBoxAttr)
    }
    
    var attrs = $svg[0].attribs
    for(var attrName in attrs){
      if(attrName.match(/xmlns:.+/)){
        var storedNs = namespaces[attrName],
            attrNs = attrs[attrName]

        if(storedNs != null){
          if( storedNs != attrNs){
            gutil.log(gutil.colors.red( 
              attrName + ' namespace appeared multiple times with different value.' +
              ' Keeping the first one : "' + storedNs +
              '".\nEach namespace must be unique across files.'))
          }
        }else{
          for(var nsName in namespaces){
            if(namespaces[nsName] == attrNs){
               gutil.log(gutil.colors.yellow(
                'Same namespace value under different names : ' + 
                  nsName + 
                  ' and ' + 
                  attrName + 
                '.\nKeeping both.'))
            }
          }

          namespaces[attrName] = attrNs;
        }
      }
    }

    var $defs = file.cheerio('defs')
    if ($defs.length > 0) {
      $combinedDefs.append($defs.contents())
      $defs.remove()
    }

    $symbol.append($svg.contents())
    $combinedSvg.append($symbol)
    cb()
  }

  stream._flush = function flush (cb) {
    if (isEmpty) return cb()
    if ($combinedDefs.contents().length === 0) {
      $combinedDefs.remove()
    }
    for(var nsName in namespaces)
      $combinedSvg.attr(nsName, namespaces[nsName]);
      
    var file = new gutil.File({ path: fileName, contents: new Buffer($.xml()) })
    file.cheerio = $
    this.push(file)
    cb()
  }

  return stream;
}
