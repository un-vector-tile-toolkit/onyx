const config = require('config')
const fs = require('fs')
const express = require('express')
const spdy = require('spdy')
const cors = require('cors')
const morgan = require('morgan')
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

// app
const app = express()
app.use(cors())
app.use(morgan(morganFormat))
app.use(express.static(htdocsPath))

spdy.createServer({
  key: fs.readFileSync(privkeyPath),
  cert: fs.readFileSync(fullchainPath),
  ca: fs.readFileSync(chainPath)
}, app).listen(port)
