const config = require('config')
const fs = require('fs')
const express = require('express')
const spdy = require('spdy')
const cors = require('cors')
const morgan = require('morgan')
const MBTiles = require('@mapbox/mbtiles')
const TimeFormat = require('hh-mm-ss')
const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')

// config constants
const morganFormat = config.get('morganFormat')
const htdocsPath = config.get('htdocsPath')
const privkeyPath = config.get('privkeyPath')
const fullchainPath = config.get('fullchainPath')
const chainPath = config.get('chainPath')
const port = config.get('port') 
const ejectInterval = config.get('ejectInterval')
const defaultZ = config.get('defaultZ')
const mbtilesDir = config.get('mbtilesDir')
const fontsDir = config.get('fontsDir')
const logDirPath = config.get('logDirPath')

// global variables
let mbtilesPool = {}
let tz = config.get('tz')
let busy = false

// logger configuration
const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      filename: `${logDirPath}/onyx-%DATE%.log`,
      datePattern: 'YYYY-MM-DD'
    })
  ]
})

logger.stream = {
  write: (message) => { logger.info(message.trim()) }
}

// auto-eject mechanism
setInterval(async () => {
  logger.info(`${Object.keys(mbtilesPool).length} mbtiles are open. Start auto-eject.`)
  if (busy) {
    logger.info('auto-eject canceled because the server is busy.')
  } else 
  for (mbtilesPath in mbtilesPool) {
    let timeDiff = fs.statSync(mbtilesPath).mtime - mbtilesPool[mbtilesPath].openTime
    if (timeDiff > 0) {
      mbtilesPool[mbtilesPath].mbtiles.close(() => {
        logger.info(`closed ${mbtilesPath} (${TimeFormat.fromMs(timeDiff)} newer)`)
        delete mbtilesPool[mbtilesPath]
      })
    }
  }
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
  if (!tz[t]) tz[t] = defaultZ
  if (z < tz[t]) {
    mbtilesPath = `${mbtilesDir}/${t}/0-0-0.mbtiles`
  } else {
    mbtilesPath =
      `${mbtilesDir}/${t}/${tz[t]}-${x >> (z - tz[t])}-${y >> (z - tz[t])}.mbtiles`
  }
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
        resolve({tile: tile, headers: headers})
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
    getTile(mbtiles, z, x, y).then(r => {
      if (r.tile) {
        res.set('content-type', 'application/vnd.mapbox-vector-tile')
        res.set('content-encoding', 'gzip')
        res.set('last-modified', r.headers['Last-Modified'])
        res.set('etag', r.headers['ETag'])
        res.send(r.tile)
        busy = false
      } else {
        res.status(404).send(`tile not found: /zxy/${t}/${z}/${x}/${y}.pbf`)
        busy = false
      }
    }).catch(e => {
      res.status(404).send(`tile not found: /zxy/${t}/${z}/${x}/${y}.pbf`)
      busy = false
    })
  }).catch(e => {
    res.status(404).send(`mbtiles not found for /zxy/${t}/${z}/${x}/${y}.pbf`)
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
