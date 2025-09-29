const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;

    // Validation
    if (!data.fullname || !data.email || !data.phone) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['fullname', 'email', 'phone']
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Process attachments
    const attachments = [];
    if (data.attachments && Array.isArray(data.attachments)) {
      for (const file of data.attachments) {
        if (file.content && file.filename) {
          attachments.push({
            filename: file.filename,
            content: Buffer.from(file.content, 'base64'),
          });
        }
      }
    }

    console.log(`Quote from ${data.fullname} with ${attachments.length} attachments`);

    // Calendar link
    const eventTitle = `Piano Move - ${data.fullname}`;
    const eventDesc = `Customer: ${data.fullname}\nPhone: ${data.phone}\nEmail: ${data.email}\nPiano: ${data.pianotype || 'Not specified'}\nPickup: ${data.pickup_postcode} (${data.pickup_steps} steps)\nDelivery: ${data.delivery_postcode} (${data.delivery_steps} steps)\n\nSpecial: ${data.specialrequirements || 'None'}\n\nAttachments: ${attachments.length}`;
    
    const calLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventTitle)}&details=${encodeURIComponent(eventDesc)}&location=${encodeURIComponent(data.pickup_postcode + ' to ' + data.delivery_postcode)}`;
    
    const waLink = `https://wa.me/${data.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hi ' + data.fullname + ', thank you for your piano moving quote request. I would like to discuss the details with you.')}`;

    // Thread ID
    const slug = data.fullname.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const threadId = `<quote-${slug}@pianomoveteam.co.uk>`;

    // Email TO YOU
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Piano Quote <quotes@pianomoveteam.co.uk>',
      to: ['thenorthpiano@googlemail.com'],
      cc: ['gogoo.ltd@gmail.com'],
      replyTo: data.email,
      subject: `Piano Moving Quote - ${data.fullname}${attachments.length > 0 ? ' (' + attachments.length + ' photos)' : ''}`,
      html: generateEmailForYou(data, calLink, waLink, attachments.length),
      attachments: attachments,
      headers: {
        'References': threadId,
        'In-Reply-To': threadId,
        'X-Entity-Ref-ID': 'customer-' + slug,
      },
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(500).json({ error: emailError.message });
    }

    console.log('Email sent. ID:', emailData?.id);

    // Email TO CUSTOMER
    await resend.emails.send({
      from: 'Piano Move Team <noreply@pianomoveteam.co.uk>',
      to: [data.email],
      subject: 'Thank you for your piano moving quote request',
      html: generateEmailForCustomer(data),
    });

    console.log('Auto-response sent to', data.email);

    return res.status(200).json({ 
      success: true, 
      message: 'Quote sent',
      emailId: emailData?.id,
      attachments: attachments.length
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// EMAIL FOR YOU
function generateEmailForYou(data, calLink, waLink, attachCount) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f6f9fc">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">

<tr><td style="padding:40px 40px 20px 40px">
<h1 style="margin:0;color:#222;font-size:28px;font-weight:900">🎹 New Piano Moving Quote Request</h1>
</td></tr>

<tr><td style="padding:0 40px 20px 40px">
<div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:20px;border-radius:8px;text-align:center">
<p style="margin:0 0 15px 0;color:#fff;font-size:16px;font-weight:600">⚡ Quick Actions</p>
<div>
<a href="${calLink}" target="_blank" style="display:inline-block;background:#fff;color:#667eea;padding:12px 30px;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px;margin:5px;box-shadow:0 4px 10px rgba(0,0,0,0.2)">📅 Add to Calendar</a>
<a href="tel:${data.phone}" style="display:inline-block;background:#fff;color:#667eea;padding:12px 30px;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px;margin:5px;box-shadow:0 4px 10px rgba(0,0,0,0.2)">📞 Call Now</a>
<a href="${waLink}" target="_blank" style="display:inline-block;background:#25D366;color:#fff;padding:12px 30px;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px;margin:5px;box-shadow:0 4px 10px rgba(37,211,102,0.3)">💬 WhatsApp</a>
</div>
</div>
</td></tr>

${attachCount > 0 ? `
<tr><td style="padding:0 40px 20px 40px">
<div style="background:#fff3cd;padding:20px;border-radius:8px;border-left:4px solid #ffc107;text-align:center">
<h3 style="margin:0 0 10px 0;color:#856404;font-size:18px;font-weight:700">📎 ${attachCount} Attachment${attachCount > 1 ? 's' : ''} Included</h3>
<p style="margin:0;color:#856404;font-size:15px">Customer uploaded ${attachCount} file${attachCount > 1 ? 's' : ''}. Check attachments below.</p>
</div>
</td></tr>
` : ''}

<tr><td style="padding:0 40px 20px 40px">
<h2 style="color:#222;font-size:20px;font-weight:700;margin:20px 0 10px 0">Customer Information</h2>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:6px;background:#f8f9fa">
<tr><td style="font-weight:600;width:35%;color:#555">Name:</td><td style="color:#222;font-size:16px"><strong>${data.fullname}</strong></td></tr>
<tr style="border-top:1px solid #e0e0e0"><td style="font-weight:600;color:#555">Email:</td><td><a href="mailto:${data.email}" style="color:#667eea;text-decoration:none;font-weight:600">${data.email}</a></td></tr>
<tr style="border-top:1px solid #e0e0e0"><td style="font-weight:600;color:#555">Phone:</td><td><a href="tel:${data.phone}" style="color:#667eea;text-decoration:none;font-weight:600;font-size:16px">${data.phone}</a></td></tr>
<tr style="border-top:1px solid #e0e0e0"><td style="font-weight:600;color:#555">Piano Type:</td><td style="color:#222">${data.pianotype || '<em style="color:#999">Not specified</em>'}</td></tr>
</table>
</td></tr>

<tr><td style="padding:0 40px 20px 40px">
<h2 style="color:#222;font-size:20px;font-weight:700;margin:20px 0 10px 0">📍 Pickup Details</h2>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:6px;background:#fff8e1">
<tr><td style="font-weight:600;width:35%;color:#555">Address:</td><td style="color:#222;font-weight:600">${data.pickup_postcode}</td></tr>
<tr style="border-top:1px solid #ffe082"><td style="font-weight:600;color:#555">Steps:</td><td style="color:#222;font-size:18px"><strong>${data.pickup_steps}</strong></td></tr>
<tr style="border-top:1px solid #ffe082"><td style="font-weight:600;color:#555">Google Maps:</td><td><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.pickup_postcode)}" target="_blank" style="color:#667eea;text-decoration:none;font-weight:600">🗺️ Open</a></td></tr>
</table>
</td></tr>

<tr><td style="padding:0 40px 20px 40px">
<h2 style="color:#222;font-size:20px;font-weight:700;margin:20px 0 10px 0">🚚 Delivery Details</h2>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:6px;background:#e8f5e9">
<tr><td style="font-weight:600;width:35%;color:#555">Address:</td><td style="color:#222;font-weight:600">${data.delivery_postcode}</td></tr>
<tr style="border-top:1px solid #a5d6a7"><td style="font-weight:600;color:#555">Steps:</td><td style="color:#222;font-size:18px"><strong>${data.delivery_steps}</strong></td></tr>
<tr style="border-top:1px solid #a5d6a7"><td style="font-weight:600;color:#555">Google Maps:</td><td><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.delivery_postcode)}" target="_blank" style="color:#667eea;text-decoration:none;font-weight:600">🗺️ Open</a></td></tr>
</table>
</td></tr>

${data.specialrequirements ? `
<tr><td style="padding:0 40px 20px 40px">
<h2 style="color:#222;font-size:20px;font-weight:700;margin:20px 0 10px 0">📝 Special Requirements</h2>
<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;border-radius:4px">
<p style="margin:0;white-space:pre-wrap;color:#333;line-height:1.6">${data.specialrequirements}</p>
</div>
</td></tr>
` : ''}

<tr><td style="padding:0 40px 20px 40px">
<div style="background:#e3f2fd;padding:15px;border-radius:6px;text-align:center">
<a href="https://www.google.com/maps/dir/${encodeURIComponent(data.pickup_postcode)}/${encodeURIComponent(data.delivery_postcode)}" target="_blank" style="display:inline-block;background:#2196f3;color:#fff;padding:12px 30px;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">🗺️ View Route</a>
</div>
</td></tr>

<tr><td style="padding:30px 40px;background:#f8f9fa;border-radius:0 0 8px 8px">
<p style="margin:0;color:#888;font-size:13px">Quote requested: <strong>${new Date().toLocaleString('en-GB', {timeZone:'Europe/London',dateStyle:'full',timeStyle:'short'})}</strong></p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
  `;
}

// EMAIL FOR CUSTOMER
function generateEmailForCustomer(data) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f6f9fc">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">

<tr><td style="padding:40px 40px 20px 40px">
<h1 style="margin:0 0 10px 0;color:#222;font-size:28px;font-weight:700">Hi ${data.fullname},</h1>
<p style="font-size:18px;line-height:1.6;color:#333;margin:0">Thank you for requesting a piano moving quote!</p>
</td></tr>

<tr><td style="padding:0 40px 20px 40px">
<p style="font-size:16px;line-height:1.6;color:#333;margin:0 0 15px 0">We've received your details and <strong>will contact you shortly</strong> with a personalized quote.</p>
</td></tr>

<tr><td style="padding:0 40px 20px 40px">
<div style="background:#f8f9fa;padding:20px;border-radius:8px;border-left:4px solid #222">
<h3 style="margin:0 0 15px 0;color:#222;font-size:18px;font-weight:700">📋 Your submission:</h3>
<table width="100%" cellpadding="8" cellspacing="0">
<tr><td style="color:#666;font-size:15px;padding:5px 0"><strong style="color:#222">Piano Type:</strong></td><td style="color:#333;font-size:15px;padding:5px 0">${data.pianotype || 'Not specified'}</td></tr>
<tr><td style="color:#666;font-size:15px;padding:5px 0"><strong style="color:#222">Pickup:</strong></td><td style="color:#333;font-size:15px;padding:5px 0">${data.pickup_postcode} (${data.pickup_steps} steps)</td></tr>
<tr><td style="color:#666;font-size:15px;padding:5px 0"><strong style="color:#222">Delivery:</strong></td><td style="color:#333;font-size:15px;padding:5px 0">${data.delivery_postcode} (${data.delivery_steps} steps)</td></tr>
</table>
</div>
</td></tr>

<tr><td style="padding:20px 40px">
<div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;border-radius:8px;text-align:center">
<h3 style="margin:0 0 10px 0;color:#fff;font-size:22px;font-weight:700">💬 Need to Reach Us?</h3>
<p style="margin:0 0 25px 0;color:#fff;font-size:15px">We're here to help - contact us anytime!</p>
<div style="margin:20px 0">
<a href="mailto:thenorthpiano@googlemail.com?subject=Piano%20Moving%20Quote%20-%20${encodeURIComponent(data.fullname)}" style="display:inline-block;background:#fff;color:#667eea;padding:15px 30px;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px;margin:8px 5px;box-shadow:0 4px 10px rgba(0,0,0,0.2)">📧 Email</a>
<a href="https://wa.me/447711872434?text=Hi,%20I%20requested%20a%20quote%20for%20${encodeURIComponent(data.pianotype || 'piano')}" target="_blank" style="display:inline-block;background:#25D366;color:#fff;padding:15px 30px;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px;margin:8px 5px">💬 WhatsApp</a>
<a href="tel:08000842902" style="display:inline-block;background:#fff;color:#667eea;padding:15px 30px;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px;margin:8px 5px;box-shadow:0 4px 10px rgba(0,0,0,0.2)">📞 Call Free</a>
</div>
<table width="100%" cellpadding="10" cellspacing="0" style="margin-top:20px;background:rgba(255,255,255,0.1);border-radius:6px">
<tr><td style="color:#fff;font-size:14px;text-align:left;padding:12px 20px">
📧 <a href="mailto:thenorthpiano@googlemail.com" style="color:#fff;text-decoration:none">thenorthpiano@googlemail.com</a><br/>
📱 <a href="tel:07711872434" style="color:#fff;text-decoration:none">07711 872 434</a> | 
☎️ <a href="tel:02034419463" style="color:#fff;text-decoration:none">020 3441 9463</a> | 
📞 <a href="tel:08000842902" style="color:#fff;text-decoration:none">0800 084 2902</a><br/>
📍 <a href="https://share.google/71aL4yZy9AwDo4tge" target="_blank" style="color:#fff;text-decoration:none">176 Millicent Grove, London N13 6HS</a>
</td></tr>
</table>
</div>
</td></tr>

<tr><td style="padding:20px 40px">
<div style="background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);padding:25px;border-radius:8px;text-align:center">
<h3 style="margin:0 0 15px 0;color:#fff;font-size:20px;font-weight:700">📱 Save Our Contact</h3>
<p style="margin:0 0 20px 0;color:#fff;font-size:15px">Add us to your phone for easy access</p>
<a href="https://www.dropbox.com/scl/fi/YOUR_DROPBOX_LINK/north-london-piano.vcf?rlkey=YOUR_KEY&dl=1" download style="display:inline-block;background:#fff;color:#f5576c;padding:15px 40px;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px;box-shadow:0 4px 10px rgba(0,0,0,0.2)">📲 Add to Contacts</a>
</div>
</td></tr>

<tr><td style="padding:20px 40px">
<div style="background:#fff8e1;padding:25px;border-radius:8px;border:2px solid #ffd54f;text-align:center">
<div style="margin-bottom:15px"><span style="font-size:36px;letter-spacing:3px">⭐⭐⭐⭐⭐</span></div>
<h3 style="margin:0 0 10px 0;color:#222;font-size:20px;font-weight:700">Trusted by Hundreds</h3>
<p style="margin:0 0 20px 0;color:#666;font-size:15px">See what our customers say!</p>
<a href="https://www.google.com/search?q=piano+transport+london+the+north+london+piano" target="_blank" style="display:inline-block;background:#4285f4;color:#fff;padding:15px 35px;text-decoration:none;border-radius:50px;font-weight:700;font-size:16px">📝 Read Reviews</a>
</div>
</td></tr>

<tr><td style="padding:30px 40px;background:#f8f9fa;border-radius:0 0 8px 8px">
<p style="margin:0 0 15px 0;color:#333;font-size:15px">Best regards,<br/><strong style="color:#222;font-size:16px">The North London Piano Team</strong></p>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0">
<p style="margin:0;color:#888;font-size:13px">📍 176 Millicent Grove, London N13 6HS<br/>🌐 <a href="https://www.pianomoveteam.co.uk" style="color:#667eea;text-decoration:none">www.pianomoveteam.co.uk</a></p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
  `;
}