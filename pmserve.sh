pm2 stop onyx; pm2 delete onyx; pm2 start app.js -i 4 --name onyx; pm2 monit

