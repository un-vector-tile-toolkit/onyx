const config = require('config')
const fs = require('fs')
const express = require('express')
const spdy = require('spdy')
const cors = require('cors')
const morgan = require('morgan')
const winston = require('winston')
const MBTiles = require('@mapbox/mbtiles')

// config constants
const morganFormat = config.get('morganFormat')
const htdocsPath = config.get('htdocsPath')
const privkeyPath = config.get('privkeyPath')
const fullchainPath = config.get('fullchainPath')
const chainPath = config.get('chainPath')
const port = config.get('port') 

// global variables
let mbtilesPool = {}
let tz = config.get('tz')
let busy = false

// global constants
const ejectInterval = config.get('ejectInterval')
const defaultZ = config.get('defaultZ')
const mbtilesDir = config.get('mbtilesDir')
const fontsDir = config.get('fontsDir')

// logger configuration
const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({ json: false, colorize: true })
  ]
})
logger.stream = {
  write: (message) => { logger.info(message) }
}

// auto-eject mechanism
setInterval(async () => {
  logger.info(`auto-eject from ${Object.keys(mbtilesPool).length}`)
/*
  if (busy) {
    logger.info('return because busy')
    return
  }
  for (mbtilesPath in mbtilesPool) {
    let mtime = fs.statSync(mbtilesPath).mtime
    if (true || mtime > mbtilesPool.mbtilesPath.openTime) {
      mbtilesPool[mbtilesPath].mbtiles.close(() => {
        logger.info(`closed ${mbtilesPath}`)
        delete mbtilesPool[mbtilesPath]
      })
    }
  }
*/
}, ejectInterval)

// app
const app = express()
app.use(cors())
app.use(morgan(morganFormat, {
  stream: logger.stream
}))
app.use(express.static(htdocsPath))

const getMBTiles = async (t, z, x, y) => {
  let mbtilesPath = ''
  if (!tz[t]) tz[t] = 6
  if (z < tz[t]) {
    mbtilesPath = `${mbtilesDir}/${t}/0-0-0.mbtiles`
  } else {
    mbtilesPath =
      `${mbtilesDir}/${t}/${tz[t]}-${x >> (z - tz[t])}-${y >> (z - tz[t])}.mbtiles`
  }
logger.info(mbtilesPath)
  return new Promise((resolve, reject) => {
    if (mbtilesPool[mbtilesPath]) {
      resolve(mbtilesPool[mbtilesPath].mbtiles)
    } else {
      if (fs.existsSync(mbtilesPath)) {
        new MBTiles(`${mbtilesPath}?mode=ro`, (err, mbtiles) => {
          if (err) {
            reject(new Error(`${mbtilesPath} could not open.`))
          } else {
            mbtilesPool[mbtilesPath] = {
              mbtiles: mbtiles, openTime: new Date()
            }
            resolve(mbtilesPool[mbtilesPath].mbtiles)
          }
        })
      } else {
        reject(new Error(`${mbtilesPath} was not found.`))
      }
    }
  })
}

const getTile = async (mbtiles, z, x, y) => {
  return new Promise((resolve, reject) => {
    mbtiles.getTile(z, x, y, (err, tile, headers) => {
      if (err) {
        reject()
      } else {
        resolve(tile)
      }
    })
  })
}

app.get(`/zxy/:t/:z/:x/:y.pbf`, async (req, res) => {
  busy = true
  const t = req.params.t
  const z = parseInt(req.params.z)
  const x = parseInt(req.params.x)
  const y = parseInt(req.params.y)
  getMBTiles(t, z, x, y).then(mbtiles => {
    getTile(mbtiles, z, x, y).then(tile => {
      if (tile) {
        res.set('content-type', 'application/vnd.mapbox-vector-tile')
        res.set('content-encoding', 'gzip')
        res.send(tile)
        busy = false
      } else {
        res.status(404).send(`tile not found: /zxy/${t}/${z}/${x}/${y}.pbf`)
        busy = false
      }
    }).catch(e => {
      res.status(404).send(`tile not found: /zxy/${t}/${z}/${x}/${y}.pbf`)
      busy = false
    })
  })
})

app.get(`/fonts/:fontstack/:range.pbf`, (req, res) => {
  res.set('content-type', 'application/x-protobuf')
  res.set('content-encoding', 'gzip')
  for(const fontstack of req.params.fontstack.split(',')) {
    const path = `${fontsDir}/${fontstack}/${req.params.range}.pbf.gz`
    if (fs.existsSync(path)) {
      res.send(fs.readFileSync(path))
      return
    }
  }
  res.status(404).send(`font not found: ${req.params.fontstack}/${req.params.range}`)
})

spdy.createServer({
  key: fs.readFileSync(privkeyPath),
  cert: fs.readFileSync(fullchainPath),
  ca: fs.readFileSync(chainPath)
}, app).listen(port)
