# FanGuru Chef Felix - German Cooking Assistant

A hosted proxy solution that integrates Chef Felix AI assistant into eatclub.de (or any cooking website).

## How It Works

1. **Proxy Server**: Intercepts all requests to the target website (eatclub.de)
2. **HTML Injection**: Automatically injects the Chef Felix widget script into every page
3. **Context-Aware**: Extracts recipe information from each page to provide relevant cooking assistance
4. **Transparent Experience**: Users see the original website content with the chatbot seamlessly integrated

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 3. Access the Proxied Site

Open your browser and navigate to:
```
http://localhost:3000
```

You'll see www.eatclub.de with the Chef Felix chatbot widget automatically injected!

## Files

- `proxy-server.js` - Main proxy server with HTML injection and URL rewriting
- `pini.js` - The Chef Felix widget (Tampermonkey script with AI integration)
- `package.json` - Dependencies and scripts

## Hosting Options

### Option 1: Railway (Recommended - Easiest)

Railway provides free hosting with automatic deployments:

1. **Sign up at [railway.app](https://railway.app)**

2. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

3. **Login and deploy:**
   ```bash
   railway login
   railway init
   railway up
   ```

4. **Get your URL:**
   ```bash
   railway domain
   ```

Your proxy will be live at `https://your-app.railway.app`

### Option 2: Render

Render offers free hosting for web services:

1. **Sign up at [render.com](https://render.com)**

2. **Create a new Web Service**
   - Connect your GitHub repo (or upload files)
   - Build Command: `npm install`
   - Start Command: `npm start`

3. **Deploy** - Render will provide a URL like `https://your-app.onrender.com`

### Option 3: Heroku

Traditional platform with free tier:

1. **Install Heroku CLI:**
   ```bash
   npm install -g heroku
   ```

2. **Create and deploy:**
   ```bash
   heroku login
   heroku create your-app-name
   git push heroku main
   ```

3. **Open your app:**
   ```bash
   heroku open
   ```

### Option 4: DigitalOcean App Platform

Simple deployment with managed infrastructure:

1. **Sign up at [digitalocean.com](https://www.digitalocean.com/products/app-platform)**

2. **Create new app** from GitHub repo or upload

3. **Configure:**
   - Build Command: `npm install`
   - Run Command: `npm start`
   - Port: 3000

### Option 5: VPS (Most Control)

For maximum control, deploy to a VPS (DigitalOcean, Linode, AWS EC2):

1. **SSH into your server:**
   ```bash
   ssh root@your-server-ip
   ```

2. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Clone and setup:**
   ```bash
   git clone your-repo
   cd funke
   npm install
   ```

4. **Use PM2 for process management:**
   ```bash
   npm install -g pm2
   pm2 start proxy-server.js
   pm2 startup
   pm2 save
   ```

5. **Setup Nginx as reverse proxy:**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## Production Checklist

### Security

- [ ] **Move API keys to environment variables**
  ```javascript
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  ```

- [ ] **Add rate limiting** (using `express-rate-limit`)
  ```bash
  npm install express-rate-limit
  ```

- [ ] **Enable HTTPS** (use Let's Encrypt or Cloudflare)

- [ ] **Hide API keys** - Proxy OpenAI requests through backend instead of client

### Performance

- [ ] **Add caching** for proxied content
- [ ] **Use CDN** for static assets (widget script, images)
- [ ] **Enable compression** (gzip/brotli)
- [ ] **Set up monitoring** (UptimeRobot, Pingdom)

### Configuration

To change the target website, edit `proxy-server.js`:

```javascript
const TARGET_SITE = 'https://www.eatclub.de'; // Change this to any cooking site
```

Update the URL rewriting pattern to match:

```javascript
decompressed = decompressed.replace(/https?:\/\/(www\.)?eatclub\.de/gi, `http://localhost:${PORT}`);
```

## Environment Variables

Create a `.env` file:

```env
OPENAI_API_KEY=your-openai-key-here
PORT=3000
TARGET_SITE=https://www.eatclub.de
```

## Custom Domain Setup

1. **Purchase domain** (Namecheap, GoDaddy, etc.)

2. **Point DNS to your host:**
   - For Railway/Render: Add CNAME record pointing to their URL
   - For VPS: Add A record pointing to server IP

3. **Configure SSL** (most hosts provide free SSL via Let's Encrypt)

## Troubleshooting

### Widget not appearing
- Check browser console for errors
- Verify proxy is rewriting URLs correctly
- Ensure `pini.js` is being served at `/pini-widget.js`

### CORS errors
- The proxy removes CSP headers, but some sites may have additional protections
- Try testing with a different target site

### API key issues
- Never commit API keys to git
- Use environment variables in production
- Consider backend proxy for API calls

## Features

✅ German language interface
✅ Context-aware responses (reads recipe from page)
✅ Chef Felix personality
✅ ZWILLING sponsorship integration
✅ Mobile responsive
✅ Draggable widget
✅ Persistent across page navigation

## Next Steps

1. **Backend API proxy**: Move OpenAI calls to server-side to hide API key
2. **Multi-language support**: Add language detection and switching
3. **Voice integration**: Add ElevenLabs voice agent for hands-free cooking
4. **Analytics**: Track usage and conversations
5. **A/B testing**: Test different prompts and UI variations

## Support

For issues or questions, check the browser console and server logs.

---

**Built with ❤️ using Node.js, Express, and OpenAI**
