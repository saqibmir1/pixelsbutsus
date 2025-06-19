### dev
```bash
cd backend
npm run dev
```

### prod
```bash
cd backend
NODE_ENV=production npm start
```

### deploy using pm2
```bash
npm install -g pm2
pm2 start server.js --name pixel-canvas
pm2 startup
pm2 save
```