# Wyng Lite - Healthcare Guardian Angel

A free, public tool that helps people understand confusing medical bills and EOBs (Explanation of Benefits) through plain-English guidance rooted in healthcare laws and best practices.

## ✨ Features

- **AI-Powered Analysis**: Upload medical bills/EOBs and get clear explanations
- **Legal Guidance**: Citations from healthcare laws (NSA, ACA, ERISA, HIPAA)
- **Cost Estimation**: Input insurance benefits for accurate cost calculations
- **Error Detection**: Identify common billing mistakes and overcharges
- **Action Plans**: Step-by-step instructions, phone scripts, and appeal letters
- **Privacy-First**: Automatic redaction of sensitive information
- **Mobile-Friendly**: Responsive design for all devices

## 🏗️ Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Anthropic Claude AI
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage for file uploads
- **OCR**: Tesseract.js (upgradable to AWS Textract/Google Vision)
- **Payments**: Stripe for donations
- **Email**: Resend for lead notifications
- **Deployment**: Vercel

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Anthropic API key
- Stripe account (for donations)
- Resend account (for emails)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd wyng-lite
npm install
```

### 2. Environment Setup

Copy the environment template:

```bash
cp .env.example .env.local
```

Fill in your environment variables:

```env
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE=your_supabase_service_role_key

# Optional (for full functionality)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PRICE_ID_DONATION=your_stripe_price_id
RESEND_API_KEY=your_resend_api_key
ADMIN_TOKEN=your_secure_admin_token
```

### 3. Database Setup

1. Create a new Supabase project
2. Run the SQL schema from `supabase/schema.sql` in the Supabase SQL editor
3. Enable Row Level Security (RLS) policies as defined in the schema
4. Create the storage bucket named "uploads"

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📋 Environment Variables Guide

### Required Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `ANTHROPIC_API_KEY` | Claude AI API key | [Anthropic Console](https://console.anthropic.com/) |
| `NEXT_PUBLIC_SITE_URL` | Your site URL | `http://localhost:3000` (dev) |
| `SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE` | Supabase service role key | Supabase Dashboard → Settings → API |

### Optional Variables

| Variable | Description | Impact if Missing |
|----------|-------------|------------------|
| `STRIPE_SECRET_KEY` | Stripe secret key | Donations won't work |
| `STRIPE_PRICE_ID_DONATION` | Stripe price ID | Default donation amount used |
| `RESEND_API_KEY` | Resend API key | Welcome emails won't send |
| `ADMIN_TOKEN` | Admin access token | CSV export won't work |

## 🗄️ Database Schema

The app uses these main tables:

- **leads**: Email signups and investor interest
- **cases**: User interactions and LLM responses
- **files**: Uploaded documents and OCR results
- **donations**: Stripe payment tracking
- **admin_logs**: Admin access logging

See `supabase/schema.sql` for the complete schema with indexes and RLS policies.

## 📁 Project Structure

```
wyng-lite/
├── src/
│   ├── app/                    # Next.js 14 app directory
│   │   ├── api/               # API routes
│   │   │   ├── chat/          # Chat completion endpoint
│   │   │   ├── upload/        # File upload with OCR
│   │   │   ├── lead/          # Lead capture
│   │   │   ├── donate/        # Stripe donations
│   │   │   └── admin/         # Admin endpoints
│   │   ├── chat/              # Chat interface page
│   │   ├── legal/             # Terms & privacy pages
│   │   ├── thank-you/         # Post-donation page
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Landing page
│   ├── components/            # React components
│   │   ├── ui/                # shadcn/ui components
│   │   └── features/          # Feature-specific components
│   └── lib/                   # Core utilities
│       ├── anthropic.ts       # AI integration
│       ├── ocr.ts            # OCR processing
│       ├── rag.ts            # Retrieval augmented generation
│       ├── laws.ts           # Healthcare law database
│       ├── policies.ts       # Insurance policy database
│       ├── benefits.ts       # Benefits calculations
│       ├── validations.ts    # Zod schemas
│       └── db.ts             # Database client
├── supabase/
│   └── schema.sql            # Database schema
├── scripts/
│   └── deploy.sh             # Deployment script
└── package.json
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript checks

### Key Development Notes

1. **File Uploads**: Limited to 10MB, supports JPEG/PNG/PDF
2. **OCR Processing**: Uses Tesseract.js, can be upgraded to cloud OCR
3. **AI Responses**: Structured JSON output validated with Zod
4. **Privacy**: Automatic PII redaction in OCR text and user messages
5. **Rate Limiting**: Basic rate limiting on chat endpoint

## 🚀 Deployment

### Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run deployment script: `./scripts/deploy.sh`
3. Deploy: `vercel --prod`
4. Set environment variables in Vercel dashboard
5. Update `NEXT_PUBLIC_SITE_URL` to production URL

### Supabase Production Setup

1. Create production Supabase project
2. Run `supabase/schema.sql` in production
3. Update environment variables
4. Set up storage bucket and RLS policies

### Stripe Setup

1. Create products/prices in Stripe dashboard
2. Set up webhooks for payment completion (optional)
3. Update environment variables

## 📊 Admin Functions

### Export Data

Get cases data (requires admin token):

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     "https://your-app.vercel.app/api/admin/cases?format=csv" \
     -o cases.csv
```

### Health Check

```bash
curl https://your-app.vercel.app/api/health
```

## 🔒 Security & Privacy

### Security Features

- HTTPS enforcement
- Content Security Policy headers
- Input validation with Zod
- SQL injection prevention via Supabase
- File type and size validation
- Rate limiting on API endpoints

### Privacy Protections

- Automatic PII redaction (emails, phones, SSNs)
- File auto-deletion after 30 days
- Row Level Security (RLS) policies
- GDPR-compliant data handling
- No third-party tracking

## 🧪 Testing

### Manual Testing Checklist

- [ ] Landing page loads and FAQ works
- [ ] Chat interface accepts text input
- [ ] File upload works with JPEG/PNG/PDF
- [ ] OCR extracts text from uploaded files
- [ ] AI generates structured responses
- [ ] Benefits form calculates costs
- [ ] Lead capture saves emails
- [ ] Donation flow redirects to Stripe
- [ ] Legal pages render correctly
- [ ] Mobile interface is responsive

### API Testing

```bash
# Health check
curl http://localhost:3000/api/health

# Chat completion (requires consent checkbox in UI)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I have a high medical bill", "benefits": {}}'
```

## 🚨 Known Limitations

### Current MVP Limitations

1. **OCR Quality**: Tesseract.js has limitations with poor quality scans
2. **AI Accuracy**: Responses are general guidance, not guaranteed accurate
3. **File Processing**: No batch processing for multiple files
4. **Languages**: English only
5. **States**: No state-specific law variations

### Planned Improvements

- [ ] Upgrade to cloud OCR (AWS Textract/Google Vision)
- [ ] Add state-specific healthcare law variations
- [ ] Implement user accounts and case history
- [ ] Add batch file processing
- [ ] Multi-language support
- [ ] Advanced analytics dashboard

## 📞 Support

### For Users
- General help: Available through the chat interface
- Technical issues: Create an issue in this repository

### For Developers
- Review the code and documentation
- Check the API responses and error messages
- Test with sample medical bills and EOBs

## 📜 Legal

### Compliance
- HIPAA: Not a covered entity, but follows privacy best practices
- GDPR: Supports data deletion and export rights
- State Privacy Laws: Complies with major state privacy regulations

### Disclaimers
- Not legal or medical advice
- Not insurance coverage
- General information only
- Users should verify with professionals

## 🤝 Contributing

This is an MVP built for Quot Health. For feature requests or bug reports, please create an issue with:

1. Clear description of the problem/request
2. Steps to reproduce (for bugs)
3. Expected vs actual behavior
4. Screenshots if relevant

## 📄 License

Copyright © 2024 Quot Health. All rights reserved.

---

## 📈 Monitoring & Analytics

### Key Metrics to Track
- Chat completions per day
- File upload success rate
- Lead conversion rate
- Donation conversion rate
- Error rates by API endpoint

### Recommended Monitoring
- Vercel Analytics for page views
- Supabase Dashboard for database metrics
- Stripe Dashboard for donation tracking
- Custom logging for chat interactions

---

Built with ❤️ by Quot Health - Your Healthcare Guardian Angel# Automated Deployment Test
