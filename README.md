# Piano Quote API

API endpoint for piano moving quote requests with email notifications.

## Features
- Email notifications via Resend
- File attachments support (up to 40MB per file)
- Google Calendar integration
- WhatsApp integration
- Automatic customer responses

## Deployment
Deployed on Vercel: https://your-project.vercel.app

## Environment Variables
- `RESEND_API_KEY` - Resend API key for sending emails

## Usage
POST /api/quote with form data