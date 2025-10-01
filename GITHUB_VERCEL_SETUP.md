# GitHub → Vercel Automated Deployment Setup

## ✅ Step 1: Connect GitHub to Vercel

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/dashboard
   - Click on your `wyng-lite` project

2. **Connect to GitHub Repository:**
   - Go to Settings → Git
   - Click "Connect to GitHub"
   - Authorize Vercel to access your GitHub
   - Select repository: `quothealth-eric/wyngai-system`
   - Choose branch: `master` (or `main` if that's what GitHub uses)

3. **Configure Build Settings:**
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

4. **Set Environment Variables in Vercel:**
   - Go to Settings → Environment Variables
   - Ensure these are set:
     ```
     USE_WYNGAI_PRIMARY=true
     ANTHROPIC_API_KEY=your-key-here
     SUPABASE_URL=your-url-here
     SUPABASE_ANON_KEY=your-key-here
     ```

## ✅ Step 2: Set Up GitHub Authentication for Local Push

Since we're getting authentication errors, you need to set up a Personal Access Token:

### Create GitHub Personal Access Token:

1. **Go to GitHub Settings:**
   - Visit: https://github.com/settings/tokens
   - Click "Generate new token (classic)"

2. **Configure Token:**
   - Note: "Vercel Deployment Token"
   - Expiration: 90 days (or your preference)
   - Select scopes:
     - ✓ repo (all)
     - ✓ workflow
   - Click "Generate token"
   - **COPY THE TOKEN NOW** (you won't see it again!)

3. **Configure Git to Use Token:**

   Run these commands in your terminal:
   ```bash
   # Set up git credentials
   git config --global user.name "quothealth-eric"
   git config --global user.email "your-email@example.com"

   # When pushing, use token as password:
   # Username: quothealth-eric
   # Password: [paste your token]
   ```

## ✅ Step 3: Push Changes from Local to GitHub

Now you can push changes using this workflow:

```bash
# 1. Make your changes locally
# 2. Stage changes
git add .

# 3. Commit changes
git commit -m "Your commit message"

# 4. Push to GitHub (will trigger Vercel deployment)
git push origin master

# When prompted:
# Username: quothealth-eric
# Password: [paste your Personal Access Token]
```

## ✅ Step 4: Alternative - Use GitHub CLI (Easier!)

Install GitHub CLI for easier authentication:

```bash
# Install GitHub CLI (if not installed)
brew install gh

# Authenticate
gh auth login

# Choose:
# - GitHub.com
# - HTTPS
# - Authenticate with browser
# - Login with your GitHub account

# Now git push will work without password prompts!
```

## 🚀 Your Automated Workflow

Once set up, your workflow will be:

1. **Make changes locally** in `/Users/ericchiyembekeza/Desktop/Claude/wyng-lite`
2. **Commit and push** to GitHub
3. **Vercel automatically deploys** within 1-2 minutes
4. **Changes go live** at https://getwyng.co

## 📊 Monitoring Deployments

- **Vercel Dashboard:** https://vercel.com/dashboard
  - See deployment status
  - View build logs
  - Check for errors

- **GitHub Actions:** https://github.com/quothealth-eric/wyngai-system/actions
  - See push history
  - View deployment triggers

## 🔧 Troubleshooting

### If Push Still Fails:
1. Make sure you're using the correct username: `quothealth-eric`
2. Use the Personal Access Token as password, not your GitHub password
3. Check token has correct permissions (repo access)

### If Vercel Doesn't Deploy:
1. Check Vercel → Settings → Git → Connected Repository
2. Verify branch name matches (master vs main)
3. Check build logs in Vercel dashboard

### Test the Pipeline:
```bash
# Make a small test change
echo "# Test deployment" >> README.md
git add README.md
git commit -m "Test automated deployment"
git push origin master
```

Then watch Vercel dashboard for automatic deployment!

## ✅ Current Status

- ✅ All files uploaded to GitHub repository
- ✅ Local repository configured with correct remote
- 🔄 Need to set up authentication (Personal Access Token or GitHub CLI)
- 🔄 Need to connect Vercel to GitHub repository
- 🎯 Ready for automated deployments once connected!