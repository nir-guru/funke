# FanGuru Deployment Guide

## Local Development

1. **Create a `.env` file** in the `funke` directory:
```bash
cp .env.example .env
```

2. **Edit `.env`** and add your OpenAI API key:
```env
OPENAI_API_KEY=your_actual_api_key_here
PORT=3000
TARGET_SITE=https://www.eatclub.de
```

3. **Install dependencies**:
```bash
npm install
```

4. **Run the server**:
```bash
npm start
```

5. **Visit** http://localhost:3000 to see the proxied site with the widget.

---

## Railway Deployment

### Prerequisites
- Install Railway CLI: `npm install -g @railway/cli`
- Have a Railway account (sign up at https://railway.app)

### Deployment Steps

1. **Login to Railway**:
```bash
railway login
```

2. **Initialize the project** (from the `funke` directory):
```bash
railway init
```

3. **Set environment variables** in Railway:
```bash
railway variables set OPENAI_API_KEY=your_actual_api_key_here
railway variables set TARGET_SITE=https://www.eatclub.de
railway variables set NODE_ENV=production
```

Alternatively, set them via the Railway dashboard:
- Go to your project settings
- Navigate to "Variables" tab
- Add:
  - `OPENAI_API_KEY`: Your OpenAI API key
  - `TARGET_SITE`: https://www.eatclub.de
  - `NODE_ENV`: production

4. **Deploy**:
```bash
railway up
```

5. **Generate a domain** (if not auto-generated):
```bash
railway domain
```

### Post-Deployment

Your app will be available at the Railway-provided URL (e.g., `https://your-app.railway.app`).

The widget will automatically load on the proxied site, and all API keys are securely stored in Railway's environment variables, never exposed to the client.

---

## Security Notes

✅ **API Key Protection**: The OpenAI API key is stored securely on the server and never sent to the client.

✅ **Environment Variables**: All secrets are managed through `.env` (local) or Railway Variables (production).

✅ **Git Ignore**: The `.env` file is excluded from version control via `.gitignore`.

⚠️ **Never commit** your `.env` file or hardcode API keys in the code.

---

## Troubleshooting

### Error: "OPENAI_API_KEY environment variable is not set"
- Make sure you've set the environment variable in Railway
- Run `railway variables` to check current variables

### Widget not loading
- Check the browser console for errors
- Verify the proxy server is running
- Check that CORS is properly configured

### API errors
- Verify your OpenAI API key is valid
- Check OpenAI API usage limits
- Review server logs: `railway logs`
