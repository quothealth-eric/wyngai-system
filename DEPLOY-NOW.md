# 🚀 Deploy Your Internal AI to Production - Action Steps

I've prepared everything for you to deploy the WyngAI integration to your live website. Here are the **specific actions** you need to take:

## 🎯 Choose Your Deployment Method

### Option 1: Quick Vercel Deployment (Recommended)

```bash
# 1. Set your environment variables
export SUPABASE_URL="your-supabase-url"
export SUPABASE_ANON_KEY="your-supabase-key"
export WYNGAI_RAG_ENDPOINT="https://rag.yourdomain.com"  # Your RAG service URL

# 2. Deploy to Vercel
cd wyng-lite
./scripts/deploy-to-vercel.sh

# 3. Update DNS to point to Vercel
# (In your domain registrar: wyng.ai -> Vercel IP)
```

### Option 2: Docker Production Server

```bash
# 1. SSH to your production server
ssh user@your-server.com

# 2. Clone your repository
git clone https://github.com/your-org/wyng-ai.git
cd wyng-ai/wyng-lite

# 3. Set environment variables
export SUPABASE_URL="your-supabase-url"
export SUPABASE_ANON_KEY="your-supabase-key"
export NEXT_PUBLIC_SITE_URL="https://wyng.ai"

# 4. Deploy
./scripts/deploy-production.sh
```

## 🛠️ What You Need to Do

### 1. **Decide on WyngAI RAG Service Hosting**

You need to deploy the WyngAI RAG service (the AI brain) somewhere accessible:

**Option A: Same server as website**
```bash
# RAG service runs on http://localhost:8000
# Website proxies /rag/ requests to it
WYNGAI_RAG_ENDPOINT=http://localhost:8000
```

**Option B: Separate server/service**
```bash
# Deploy RAG service to dedicated server
# Point website to external RAG endpoint
WYNGAI_RAG_ENDPOINT=https://rag.yourdomain.com
```

**Option C: Cloud service**
```bash
# Deploy RAG to Railway, Render, or cloud provider
# Use provided endpoint URL
WYNGAI_RAG_ENDPOINT=https://your-app.railway.app
```

### 2. **Set Required Environment Variables**

Replace these with your actual values:

```bash
# Required
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export WYNGAI_RAG_ENDPOINT="https://rag.yourdomain.com"

# Optional (for services)
export RESEND_API_KEY="re_..."
export STRIPE_SECRET_KEY="sk_..."

# Fallback LLMs (recommended for production resilience)
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

### 3. **Deploy to Your Platform**

Choose one:

#### Vercel (Frontend + Serverless)
```bash
cd wyng-lite
./scripts/deploy-to-vercel.sh
```

#### Railway (Full Stack)
```bash
# Connect GitHub repo to Railway
# Set environment variables in dashboard
# Deploy automatically
```

#### Your Own Server
```bash
cd wyng-lite
./scripts/deploy-production.sh
```

### 4. **Update DNS (If Using Custom Domain)**

Point your domain to the new deployment:
- **Vercel**: `wyng.ai` → Vercel's IP/CNAME
- **Server**: `wyng.ai` → Your server IP
- **Cloud**: `wyng.ai` → Cloud provider endpoint

## 🧪 Test Your Deployment

### 1. Basic Health Check
```bash
curl https://wyng.ai/api/health
```

### 2. Test WyngAI Integration
```bash
curl -X POST https://wyng.ai/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "My insurance denied my surgery claim, what should I do?", "benefits": {}}'
```

### 3. Look for Success Indicators
- ✅ Response includes citations like "29 CFR 2560.503-1"
- ✅ Response time < 5 seconds
- ✅ Confidence score 80-95%
- ✅ No OpenAI/Anthropic API calls in logs

## 📞 If You Need Help

### Common Issues

**"WyngAI service not available"**
- Deploy the RAG service first: `cd .. && make serve`
- Check WYNGAI_RAG_ENDPOINT is correct
- Verify RAG service health: `curl $WYNGAI_RAG_ENDPOINT/health`

**"Missing environment variables"**
- Double-check SUPABASE_URL and SUPABASE_ANON_KEY
- Verify they're set in your hosting platform dashboard

**"Fallback to OpenAI"**
- WyngAI is failing, check RAG service logs
- May need to populate the healthcare database first

### Contact Support
- Technical issues: engineering@wyng.ai
- Deployment help: your-devops-team
- Hosting questions: your-hosting-provider

## 🎉 Success Checklist

When deployment is complete, you should see:

- [ ] **Website loads** at your domain
- [ ] **Chat works** and gives healthcare responses
- [ ] **Citations included** (CFR, USC, Medicare policies)
- [ ] **Fast responses** (2-5 seconds)
- [ ] **No external LLM costs** (unless fallback triggered)
- [ ] **Regulatory expertise** in every response

---

## 🚀 Ready to Deploy?

**Choose your deployment method above and execute the commands.**

Your website will then be powered by internal AI instead of external APIs, giving users expert healthcare guidance with regulatory backing!

**🎯 Take action now to deploy your internal AI to production!**