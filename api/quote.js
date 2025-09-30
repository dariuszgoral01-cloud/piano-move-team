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

// ==========================================
// EMAIL FOR YOU (BUSINESS) - WITH JOB SHEET
// ==========================================
function generateEmailForYou(data, calLink, waLink, attachCount) {
  const today = new Date();
  const jobDate = today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const jobRef = `PMT-${Date.now().toString().slice(-6)}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .button { padding: 18px 32px !important; font-size: 16px !important; }
      h1 { font-size: 22px !important; }
      .section-title { font-size: 16px !important; }
    }
    @media print {
      .no-print { display: none !important; }
      .job-sheet { page-break-after: always; }
      body { background: white !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff">
  
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:20px 0">
  <tr>
    <td align="center">
      
      <!-- EMAIL HEADER -->
      <table class="container no-print" width="650" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid #000000;max-width:650px;margin-bottom:30px">
        
        <tr>
          <td style="padding:30px 30px;border-bottom:3px solid #000000">
            <h1 style="margin:0;color:#000000;font-size:24px;font-weight:700;letter-spacing:-0.5px">New Piano Moving Quote Request</h1>
            <p style="margin:10px 0 0 0;color:#666666;font-size:15px">${new Date().toLocaleString('en-GB', {timeZone:'Europe/London',dateStyle:'full',timeStyle:'short'})}</p>
          </td>
        </tr>

        ${attachCount > 0 ? `
        <tr>
          <td style="padding:20px 30px;background:#f9f9f9;border-bottom:1px solid #e0e0e0">
            <p style="margin:0;color:#000000;font-size:16px;font-weight:600">📎 ${attachCount} Attachment${attachCount > 1 ? 's' : ''} Included</p>
            <p style="margin:8px 0 0 0;color:#666666;font-size:15px">Customer uploaded ${attachCount} file${attachCount > 1 ? 's' : ''}</p>
          </td>
        </tr>
        ` : ''}

        <tr>
          <td style="padding:30px 30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Quick Actions</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:14px">
                  <a href="${calLink}" target="_blank" class="button" style="display:inline-block;background:#000000;color:#ffffff;padding:18px 32px;text-decoration:none;font-weight:600;font-size:16px;border:2px solid #000000;width:100%;max-width:300px;box-sizing:border-box;text-align:center">Add to Calendar</a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:14px">
                  <a href="tel:${data.phone}" class="button" style="display:inline-block;background:#ffffff;color:#000000;border:2px solid #000000;padding:18px 32px;text-decoration:none;font-weight:600;font-size:16px;width:100%;max-width:300px;box-sizing:border-box;text-align:center">Call Now</a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:14px">
                  <a href="${waLink}" target="_blank" class="button" style="display:inline-block;background:#25D366;color:#ffffff;padding:18px 32px;text-decoration:none;font-weight:600;font-size:16px;border:2px solid #25D366;width:100%;max-width:300px;box-sizing:border-box;text-align:center">WhatsApp</a>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="javascript:window.print()" class="button" style="display:inline-block;background:#ffffff;color:#000000;border:2px solid #000000;padding:18px 32px;text-decoration:none;font-weight:600;font-size:16px;width:100%;max-width:300px;box-sizing:border-box;text-align:center">🖨️ Print Job Sheet</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Customer Information</p>
            <table width="100%" cellpadding="14" cellspacing="0" style="border:1px solid #e0e0e0">
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;width:35%;color:#666666;font-size:15px;background:#f9f9f9">Name</td>
                <td style="color:#000000;font-size:16px;font-weight:600">${data.fullname}</td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;font-size:15px;background:#f9f9f9">Email</td>
                <td><a href="mailto:${data.email}" style="color:#000000;text-decoration:none;font-size:16px">${data.email}</a></td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;font-size:15px;background:#f9f9f9">Phone</td>
                <td><a href="tel:${data.phone}" style="color:#000000;text-decoration:none;font-size:17px;font-weight:700">${data.phone}</a></td>
              </tr>
              <tr>
                <td style="font-weight:600;color:#666666;font-size:15px;background:#f9f9f9">Piano</td>
                <td style="color:#000000;font-size:16px">${data.pianotype || 'Not specified'}</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">📍 Pickup Location</p>
            <table width="100%" cellpadding="14" cellspacing="0" style="border:1px solid #e0e0e0">
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;width:35%;color:#666666;font-size:15px;background:#f9f9f9">Address</td>
                <td style="color:#000000;font-size:16px;font-weight:600">${data.pickup_postcode}</td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;font-size:15px;background:#f9f9f9">Steps</td>
                <td style="color:#000000;font-size:20px;font-weight:700">${data.pickup_steps}</td>
              </tr>
              <tr>
                <td style="font-weight:600;color:#666666;font-size:15px;background:#f9f9f9">Maps</td>
                <td><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.pickup_postcode)}" target="_blank" style="color:#000000;text-decoration:underline;font-size:15px;font-weight:600">Open in Maps →</a></td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">🚚 Delivery Location</p>
            <table width="100%" cellpadding="14" cellspacing="0" style="border:1px solid #e0e0e0">
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;width:35%;color:#666666;font-size:15px;background:#f9f9f9">Address</td>
                <td style="color:#000000;font-size:16px;font-weight:600">${data.delivery_postcode}</td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;font-size:15px;background:#f9f9f9">Steps</td>
                <td style="color:#000000;font-size:20px;font-weight:700">${data.delivery_steps}</td>
              </tr>
              <tr>
                <td style="font-weight:600;color:#666666;font-size:15px;background:#f9f9f9">Maps</td>
                <td><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.delivery_postcode)}" target="_blank" style="color:#000000;text-decoration:underline;font-size:15px;font-weight:600">Open in Maps →</a></td>
              </tr>
            </table>
          </td>
        </tr>

        ${data.specialrequirements ? `
        <tr>
          <td style="padding:30px 30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">📝 Special Requirements</p>
            <div style="border:1px solid #e0e0e0;padding:18px;background:#f9f9f9">
              <p style="margin:0;color:#333333;font-size:16px;line-height:1.7;white-space:pre-wrap">${data.specialrequirements}</p>
            </div>
          </td>
        </tr>
        ` : ''}

        <tr>
          <td style="padding:30px 30px;text-align:center;border-bottom:1px solid #e0e0e0">
            <a href="https://www.google.com/maps/dir/${encodeURIComponent(data.pickup_postcode)}/${encodeURIComponent(data.delivery_postcode)}" target="_blank" style="display:inline-block;background:#000000;color:#ffffff;padding:18px 40px;text-decoration:none;font-weight:600;font-size:16px;border:2px solid #000000">View Route & Distance →</a>
          </td>
        </tr>

        <tr>
          <td style="padding:25px 30px;background:#f9f9f9;text-align:center">
            <p style="margin:0;color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:1px">Piano Move Team • Quote Management</p>
          </td>
        </tr>

      </table>

      <!-- JOB SHEET - PRINTABLE -->
      <table class="container job-sheet" width="650" cellpadding="0" cellspacing="0" style="background:#ffffff;border:3px solid #000000;max-width:650px">
        
        <tr>
          <td style="padding:30px;border-bottom:3px solid #000000;background:#000000;color:#ffffff">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:70%">
                  <h1 style="margin:0 0 5px 0;color:#ffffff;font-size:28px;font-weight:900">JOB SHEET</h1>
                  <p style="margin:0;color:#ffffff;font-size:14px">The North London Piano</p>
                </td>
                <td style="width:30%;text-align:right">
                  <p style="margin:0;color:#ffffff;font-size:12px">REF: <strong>${jobRef}</strong></p>
                  <p style="margin:5px 0 0 0;color:#ffffff;font-size:12px">Date: ${jobDate}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:25px 30px;border-bottom:2px solid #000000">
            <p style="margin:0 0 15px 0;color:#000000;font-size:16px;font-weight:700;text-transform:uppercase">CUSTOMER DETAILS</p>
            <table width="100%" cellpadding="8" cellspacing="0">
              <tr>
                <td style="width:25%;font-weight:700;font-size:14px">Name:</td>
                <td style="font-size:14px">${data.fullname}</td>
              </tr>
              <tr>
                <td style="font-weight:700;font-size:14px">Phone:</td>
                <td style="font-size:14px;font-weight:700">${data.phone}</td>
              </tr>
              <tr>
                <td style="font-weight:700;font-size:14px">Email:</td>
                <td style="font-size:14px">${data.email}</td>
              </tr>
              <tr>
                <td style="font-weight:700;font-size:14px">Piano Type:</td>
                <td style="font-size:14px;font-weight:700">${data.pianotype || 'Not specified'}</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:25px 30px;border-bottom:2px solid #000000">
            <p style="margin:0 0 15px 0;color:#000000;font-size:16px;font-weight:700;text-transform:uppercase">📍 PICKUP LOCATION</p>
            <table width="100%" cellpadding="8" cellspacing="0" style="background:#f9f9f9;border:2px solid #000000">
              <tr>
                <td style="padding:15px">
                  <p style="margin:0 0 5px 0;font-size:12px;color:#666666;font-weight:600">ADDRESS:</p>
                  <p style="margin:0 0 15px 0;font-size:16px;font-weight:700;color:#000000">${data.pickup_postcode}</p>
                  <p style="margin:0 0 5px 0;font-size:12px;color:#666666;font-weight:600">STEPS:</p>
                  <p style="margin:0;font-size:24px;font-weight:900;color:#000000">${data.pickup_steps}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:25px 30px;border-bottom:2px solid #000000">
            <p style="margin:0 0 15px 0;color:#000000;font-size:16px;font-weight:700;text-transform:uppercase">🚚 DELIVERY LOCATION</p>
            <table width="100%" cellpadding="8" cellspacing="0" style="background:#f9f9f9;border:2px solid #000000">
              <tr>
                <td style="padding:15px">
                  <p style="margin:0 0 5px 0;font-size:12px;color:#666666;font-weight:600">ADDRESS:</p>
                  <p style="margin:0 0 15px 0;font-size:16px;font-weight:700;color:#000000">${data.delivery_postcode}</p>
                  <p style="margin:0 0 5px 0;font-size:12px;color:#666666;font-weight:600">STEPS:</p>
                  <p style="margin:0;font-size:24px;font-weight:900;color:#000000">${data.delivery_steps}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${data.specialrequirements ? `
        <tr>
          <td style="padding:25px 30px;border-bottom:2px solid #000000">
            <p style="margin:0 0 15px 0;color:#000000;font-size:16px;font-weight:700;text-transform:uppercase">📝 SPECIAL REQUIREMENTS</p>
            <div style="border:2px solid #000000;padding:15px;background:#fffacd">
              <p style="margin:0;color:#000000;font-size:14px;line-height:1.6;white-space:pre-wrap">${data.specialrequirements}</p>
            </div>
          </td>
        </tr>
        ` : ''}

        <tr>
          <td style="padding:25px 30px;border-bottom:2px solid #000000">
            <p style="margin:0 0 15px 0;color:#000000;font-size:16px;font-weight:700;text-transform:uppercase">✍️ NOTES / QUOTE</p>
            <div style="border:2px solid #000000;min-height:150px;padding:15px;background:#ffffff">
              <p style="margin:0;color:#999999;font-size:12px">Space for notes, quote amount, and additional information...</p>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:25px 30px;border-bottom:2px solid #000000">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding-right:10px">
                  <p style="margin:0 0 10px 0;color:#000000;font-size:14px;font-weight:700">CREW SIGNATURE:</p>
                  <div style="border-bottom:2px solid #000000;height:50px"></div>
                </td>
                <td style="width:50%;padding-left:10px">
                  <p style="margin:0 0 10px 0;color:#000000;font-size:14px;font-weight:700">CUSTOMER SIGNATURE:</p>
                  <div style="border-bottom:2px solid #000000;height:50px"></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 30px;background:#000000;text-align:center">
            <p style="margin:0;color:#ffffff;font-size:11px">The North London Piano • 176 Millicent Grove, London N13 6HS</p>
            <p style="margin:5px 0 0 0;color:#ffffff;font-size:11px">Tel: 020 3441 9463 • Mobile: 07711 872 434 • Email: thenorthpiano@googlemail.com</p>
          </td>
        </tr>

      </table>
      
    </td>
  </tr>
</table>

</body>
</html>
  `;
}

// ==========================================
// EMAIL FOR CUSTOMER - TABELA USUNIĘTA
// ==========================================
function generateEmailForCustomer(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .button { padding: 18px 32px !important; font-size: 17px !important; display: block !important; margin-bottom: 12px !important; }
      h1 { font-size: 26px !important; }
      .section-title { font-size: 18px !important; }
      .text { font-size: 17px !important; line-height: 1.6 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff">
  
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:20px 0">
  <tr>
    <td align="center">
      
      <table class="container" width="650" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid #000000;max-width:650px">
        
        <tr>
          <td style="padding:40px 30px 30px 30px">
            <h1 style="margin:0 0 18px 0;color:#000000;font-size:30px;font-weight:700;letter-spacing:-0.5px">Hi ${data.fullname},</h1>
            <p class="text" style="margin:0 0 12px 0;color:#333333;font-size:18px;line-height:1.6">Thank you for requesting a piano moving quote.</p>
            <p class="text" style="margin:0;color:#333333;font-size:18px;line-height:1.6">We've received your details and <strong>will contact you shortly</strong> with a personalized quote.</p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 30px 30px">
            <table width="100%" cellpadding="22" cellspacing="0" style="border:2px solid #000000">
              <tr>
                <td>
                  <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Your Submission</p>
                  <table width="100%" cellpadding="10" cellspacing="0">
                    <tr style="border-bottom:1px solid #e0e0e0">
                      <td style="color:#666666;font-size:16px;width:35%;padding:10px 0">Piano Type</td>
                      <td style="color:#000000;font-size:17px;font-weight:600;padding:10px 0">${data.pianotype || 'Not specified'}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e0e0e0">
                      <td style="color:#666666;font-size:16px;padding:10px 0">Pickup</td>
                      <td style="color:#000000;font-size:16px;padding:10px 0">${data.pickup_postcode} <span style="color:#666666;font-size:15px">(${data.pickup_steps} steps)</span></td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:16px;padding:10px 0">Delivery</td>
                      <td style="color:#000000;font-size:16px;padding:10px 0">${data.delivery_postcode} <span style="color:#666666;font-size:15px">(${data.delivery_steps} steps)</span></td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px">
            <div style="border-top:1px solid #e0e0e0"></div>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px">
            <p class="section-title" style="margin:0 0 20px 0;color:#000000;font-size:20px;font-weight:600;letter-spacing:-0.5px">Need to Reach Us?</p>
            <p class="text" style="margin:0 0 24px 0;color:#666666;font-size:17px;line-height:1.6">Have questions or want to discuss your piano move? We're here to help!</p>
            
            <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
                <td style="padding-bottom:14px">
                  <a href="mailto:thenorthpiano@googlemail.com?subject=Piano%20Quote%20-%20${encodeURIComponent(data.fullname)}" class="button" style="display:inline-block;background:#000000;color:#ffffff;padding:18px 32px;text-decoration:none;font-weight:600;font-size:16px;border:2px solid #000000">Email Us</a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:14px">
                  <a href="https://wa.me/447711872434?text=Hi,%20I%20requested%20a%20quote%20for%20moving%20my%20piano" target="_blank" class="button" style="display:inline-block;background:#25D366;color:#ffffff;padding:18px 32px;text-decoration:none;font-weight:600;font-size:16px;border:2px solid #25D366">WhatsApp</a>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="tel:02034419463" class="button" style="display:inline-block;background:#ffffff;color:#000000;border:2px solid #000000;padding:16px 32px;text-decoration:none;font-weight:600;font-size:16px">Call Us</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px">
            <div style="border-top:1px solid #e0e0e0"></div>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px;text-align:center">
            <p class="section-title" style="margin:0 0 18px 0;color:#000000;font-size:20px;font-weight:600;letter-spacing:-0.5px">📱 Save Our Contact</p>
            <p class="text" style="margin:0 0 24px 0;color:#666666;font-size:17px;line-height:1.6">Add us to your phone contacts for easy access next time you need us.</p>
            <a href="https://piano-move-team.vercel.app/contact.vcf" download="The-North-London-Piano.vcf" class="button" style="display:inline-block;background:#000000;color:#ffffff;padding:18px 42px;text-decoration:none;font-weight:600;font-size:17px;border:2px solid #000000">📲 Add to Contacts</a>
            <p style="margin:20px 0 0 0;color:#999999;font-size:14px">One tap - all our contact info saved!</p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px">
            <div style="border-top:1px solid #e0e0e0"></div>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px">
            <p class="section-title" style="margin:0 0 24px 0;color:#000000;font-size:20px;font-weight:600;letter-spacing:-0.5px">Why Choose The North London Piano?</p>
            
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;width:35px;padding:0 14px 18px 0">
                  <span style="font-size:24px">✓</span>
                </td>
                <td style="vertical-align:top;padding:0 0 18px 0">
                  <p style="margin:0;color:#000000;font-size:17px;font-weight:600">Expert Piano Specialists</p>
                  <p style="margin:6px 0 0 0;color:#666666;font-size:16px;line-height:1.5">Trained professionals with years of experience</p>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;padding:0 14px 18px 0">
                  <span style="font-size:24px">✓</span>
                </td>
                <td style="vertical-align:top;padding:0 0 18px 0">
                  <p style="margin:0;color:#000000;font-size:17px;font-weight:600">Fully Insured Service</p>
                  <p style="margin:6px 0 0 0;color:#666666;font-size:16px;line-height:1.5">Your valuable piano is protected throughout</p>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;padding:0 14px 18px 0">
                  <span style="font-size:24px">✓</span>
                </td>
                <td style="vertical-align:top;padding:0 0 18px 0">
                  <p style="margin:0;color:#000000;font-size:17px;font-weight:600">Professional Equipment</p>
                  <p style="margin:6px 0 0 0;color:#666666;font-size:16px;line-height:1.5">Specialized tools for safe transport</p>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;padding:0 14px 0 0">
                  <span style="font-size:24px">✓</span>
                </td>
                <td style="vertical-align:top;padding:0">
                  <p style="margin:0;color:#000000;font-size:17px;font-weight:600">Trusted in London</p>
                  <p style="margin:6px 0 0 0;color:#666666;font-size:16px;line-height:1.5">Based in North London, serving all areas</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px">
            <div style="border-top:1px solid #e0e0e0"></div>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px;text-align:center">
            <p style="margin:0 0 15px 0;font-size:38px;letter-spacing:4px;line-height:1">
              <span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span>
            </p>
            <p class="section-title" style="margin:0 0 20px 0;color:#000000;font-size:19px;font-weight:600">Trusted by Hundreds of Satisfied Customers</p>
            <p class="text" style="margin:0 0 24px 0;color:#666666;font-size:17px;line-height:1.6">Don't just take our word for it - see what our happy customers say about our professional piano moving services.</p>
            <a href="https://www.google.com/search?q=piano+transport+london+the+north+london+piano" target="_blank" class="button" style="display:inline-block;background:#ffffff;color:#000000;border:2px solid #000000;padding:16px 36px;text-decoration:none;font-weight:600;font-size:16px">Read Our Google Reviews →</a>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px;background:#f9f9f9;border-top:2px solid #000000">
            <p style="margin:0 0 8px 0;color:#000000;font-size:17px;font-weight:600">Best regards,</p>
            <p style="margin:0 0 24px 0;color:#000000;font-size:17px;font-weight:600">The North London Piano Team</p>
            
            <div style="border-top:1px solid #e0e0e0;padding-top:20px;margin-top:20px">
              <p style="margin:0;color:#999999;font-size:14px;line-height:1.7">
                176 Millicent Grove, London N13 6HS<br/>
                <a href="https://www.pianomoveteam.co.uk" style="color:#666666;text-decoration:underline">www.pianomoveteam.co.uk</a>
              </p>
            </div>
          </td>
        </tr>

      </table>
      
    </td>
  </tr>
</table>

</body>
</html>
  `;
}
