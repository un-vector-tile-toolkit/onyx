# onyx
A new vector tile server (to take over pietra and spinel)

## background
I wanted to have a simple, scalable, fast, and interoperable vector tile server as a part of the UN Vector Tile Toolkit. 

## install
```console
npm install -g pm2
git clone git@github.com:un-vector-tile-toolkit/onyx
cd onyx
npm install
mkdir config
vi config/default.hjson
```

## an example of config/default.hjson
```console
{
  morganFormat: tiny
  htdocsPath: htdocs
  privkeyPath: /somewhere/privkey.pem
  fullchainPath: /somewhere/fullchain.pem
  chainPath: /somewhere/chain.pem
  logDirPath: log
  tz: {
    tapioca: 6
  }
  ejectInterval: 10000
  defaultZ: 6
  mbtilesDir: /somewhere/mbtiles
  fontsDir: /somewhere/fonts
}
```

I use \*.pem files from [Let's Encrypt](https://letsencrypt.org/).

## run
```console
./pmserve.sh
```

## stop
```console
./pmstop.sh
```
