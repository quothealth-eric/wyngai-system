# 🚀 Production Deployment Checklist

This checklist will guide you through deploying the WyngAI integration to your live website.

## ⚠️ Pre-Deployment Requirements

### 1. Environment Setup
- [ ] **Production server/hosting** ready (AWS, GCP, Azure, or VPS)
- [ ] **Domain configured** (wyng.ai or your domain)
- [ ] **SSL certificate** installed
- [ ] **Docker installed** on production server
- [ ] **Git repository** access for deployment

### 2. Required Credentials
- [ ] **Supabase Production URL** and API key
- [ ] **Resend API key** for emails
- [ ] **Stripe secret key** for payments
- [ ] **Domain/SSL certificates**
- [ ] **Server SSH access** or hosting platform credentials

### 3. Infrastructure Requirements
- [ ] **Minimum 8GB RAM** (for WyngAI embeddings)
- [ ] **50GB storage** (for healthcare database)
- [ ] **PostgreSQL with pgvector** extension
- [ ] **Docker Compose** support

## 🏗️ Deployment Options

### Option A: Manual Server Deployment

#### Step 1: Server Preparation
```bash
# SSH into your production server
ssh user@your-server.com

# Install Docker and Docker Compose
sudo apt update
sudo apt install docker.io docker-compose
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

#### Step 2: Clone and Deploy
```bash
# Clone your repository (replace with your actual repo)
git clone https://github.com/your-org/wyng-ai.git
cd wyng-ai

# Set production environment variables
export SUPABASE_URL="your-production-supabase-url"
export SUPABASE_ANON_KEY="your-production-supabase-key"
export NEXT_PUBLIC_SITE_URL="https://wyng.ai"
export RESEND_API_KEY="your-resend-key"
export STRIPE_SECRET_KEY="your-stripe-key"

# Run production deployment
cd wyng-lite
./scripts/deploy-production.sh

# Configure reverse proxy (nginx)
sudo apt install nginx
# Copy nginx config (see below)
sudo systemctl reload nginx
```

### Option B: Cloud Platform Deployment

#### Vercel (Recommended for Frontend)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy frontend with environment variables
cd wyng-lite
vercel --prod --env WYNGAI_RAG_ENDPOINT=https://rag.wyng.ai
```

#### Railway/Render (For Full Stack)
```bash
# Connect your Git repository
# Set environment variables in dashboard
# Deploy automatically on push
```

#### AWS ECS/Google Cloud Run
```bash
# Build and push Docker images
docker build -t your-registry/wyngai:latest ../
docker build -t your-registry/wyng-lite:latest ./

# Deploy to container service
# (Platform-specific commands)
```

## 🔧 Configuration Files

### 1. Production Environment (.env.production)
```bash
# Create this file on your server
cat > /path/to/wyng-ai/wyng-lite/.env.production << 'EOF'
# WyngAI Configuration
USE_WYNGAI_PRIMARY=true
WYNGAI_RAG_ENDPOINT=http://wyngai:8000
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://wyng.ai

# Database
SUPABASE_URL=your-production-supabase-url
SUPABASE_ANON_KEY=your-production-supabase-key

# Services
RESEND_API_KEY=your-production-resend-key
STRIPE_SECRET_KEY=your-production-stripe-key

# Optional Fallbacks
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
EOF
```

### 2. Nginx Configuration
```nginx
# /etc/nginx/sites-available/wyng.ai
server {
    listen 80;
    server_name wyng.ai www.wyng.ai;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name wyng.ai www.wyng.ai;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /rag/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Docker Compose Production Override
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  wyngai:
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G

  wyng-lite:
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_SITE_URL=https://wyng.ai
    deploy:
      resources:
        limits:
          memory: 1G

  postgres:
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - /backup:/backup
```

## 📋 Deployment Steps

### Step 1: Prepare Production Data
```bash
# On your server, prepare WyngAI data
cd /path/to/wyng-ai
make install
make registry
make fetch-ecfr fetch-fedreg  # Fetch initial data
make normalize chunk index    # Build search index
```

### Step 2: Deploy Services
```bash
# Deploy with production configuration
cd wyng-lite
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Wait for services to start
sleep 60

# Check health
curl https://wyng.ai/api/health
curl https://wyng.ai/rag/health
```

### Step 3: Test Production
```bash
# Run integration test against production
node scripts/test-integration.js

# Test actual website
curl -X POST https://wyng.ai/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "My insurance denied my claim, what should I do?"}'
```

## 🔍 Verification Checklist

### Before Going Live
- [ ] **Health checks pass**
  ```bash
  curl https://wyng.ai/api/health
  curl https://wyng.ai/rag/health
  ```

- [ ] **Integration test passes**
  ```bash
  node scripts/test-integration.js
  ```

- [ ] **WyngAI responds with citations**
  - Test question includes CFR/USC citations
  - Response time < 5 seconds
  - Confidence score > 80%

- [ ] **Frontend works correctly**
  - Chat interface loads
  - File upload works
  - No console errors

- [ ] **SSL certificate valid**
  ```bash
  curl -I https://wyng.ai
  ```

### Post-Deployment Monitoring
- [ ] **Set up monitoring**
  ```bash
  # Monitor service health
  watch -n 30 'curl -s https://wyng.ai/api/health | jq .status'

  # Monitor logs
  docker-compose logs -f --tail=100
  ```

- [ ] **Performance metrics**
  - Average response time
  - Citation quality
  - Fallback rate to external LLMs

## 🚨 Rollback Plan

If issues arise:

### Quick Rollback
```bash
# Disable WyngAI, use external LLMs only
export USE_WYNGAI_PRIMARY=false
docker-compose restart wyng-lite
```

### Full Rollback
```bash
# Revert to previous version
git checkout previous-commit
docker-compose down
docker-compose up -d
```

## 🎯 Go-Live Commands

### Final Deployment Commands
```bash
# 1. Set production environment
export NODE_ENV=production
export NEXT_PUBLIC_SITE_URL=https://wyng.ai

# 2. Deploy integrated system
cd wyng-lite
./scripts/deploy-production.sh

# 3. Configure web server
sudo nginx -t && sudo systemctl reload nginx

# 4. Monitor deployment
./scripts/test-integration.js

# 5. Check live website
curl -X POST https://wyng.ai/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Test WyngAI integration"}'
```

## 📞 Support During Deployment

### Logs to Monitor
```bash
# Application logs
docker-compose logs -f wyng-lite

# RAG service logs
docker-compose logs -f wyngai

# System logs
sudo journalctl -f -u nginx
```

### Health Endpoints
- **Frontend**: https://wyng.ai/api/health
- **RAG Service**: https://wyng.ai/rag/health (via proxy)
- **Direct RAG**: http://localhost:8000/health (server only)

### Emergency Contacts
- Technical issues: engineering@wyng.ai
- Infrastructure: your-devops-team
- Domain/SSL: your-hosting-provider

---

## ✅ Ready for Production!

Once you complete this checklist, your website will be running on internal AI instead of external APIs. Users will get expert healthcare guidance with regulatory citations, all processed within your own infrastructure.

**Next steps**: Complete the deployment using your preferred method above, then test thoroughly before announcing the new AI capabilities to your users.