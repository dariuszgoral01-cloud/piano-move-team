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
// EMAIL FOR YOU (BUSINESS)
// ==========================================
function generateEmailForYou(data, calLink, waLink, attachCount) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff">
  
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:20px 0">
  <tr>
    <td align="center">
      
      <!-- Main Container -->
      <table width="650" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid #000000">
        
        <!-- Header -->
        <tr>
          <td style="padding:30px 40px;border-bottom:3px solid #000000">
            <h1 style="margin:0;color:#000000;font-size:24px;font-weight:700;letter-spacing:-0.5px">New Piano Moving Quote Request</h1>
            <p style="margin:8px 0 0 0;color:#666666;font-size:13px">${new Date().toLocaleString('en-GB', {timeZone:'Europe/London',dateStyle:'full',timeStyle:'short'})}</p>
          </td>
        </tr>

        ${attachCount > 0 ? `
        <!-- Attachments Alert -->
        <tr>
          <td style="padding:20px 40px;background:#f9f9f9;border-bottom:1px solid #e0e0e0">
            <p style="margin:0;color:#000000;font-size:14px;font-weight:600">📎 ${attachCount} Attachment${attachCount > 1 ? 's' : ''} Included</p>
            <p style="margin:5px 0 0 0;color:#666666;font-size:13px">Customer uploaded ${attachCount} file${attachCount > 1 ? 's' : ''} - check attachments below</p>
          </td>
        </tr>
        ` : ''}

        <!-- Action Buttons -->
        <tr>
          <td style="padding:30px 40px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 15px 0;color:#000000;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Quick Actions</p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 8px 0 0">
                  <a href="${calLink}" target="_blank" style="display:inline-block;background:#000000;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:600;font-size:13px;border:2px solid #000000">Add to Calendar</a>
                </td>
                <td style="padding:0 8px">
                  <a href="tel:${data.phone}" style="display:inline-block;background:#ffffff;color:#000000;border:2px solid #000000;padding:10px 24px;text-decoration:none;font-weight:600;font-size:13px">Call Now</a>
                </td>
                <td style="padding:0 0 0 8px">
                  <a href="${waLink}" target="_blank" style="display:inline-block;background:#25D366;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:600;font-size:13px;border:2px solid #25D366">WhatsApp</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Customer Information -->
        <tr>
          <td style="padding:30px 40px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 15px 0;color:#000000;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Customer Information</p>
            <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e0e0e0">
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;width:30%;color:#666666;font-size:13px;background:#f9f9f9">Name</td>
                <td style="color:#000000;font-size:14px;font-weight:600">${data.fullname}</td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;font-size:13px;background:#f9f9f9">Email</td>
                <td><a href="mailto:${data.email}" style="color:#000000;text-decoration:none;font-size:14px">${data.email}</a></td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;font-size:13px;background:#f9f9f9">Phone</td>
                <td><a href="tel:${data.phone}" style="color:#000000;text-decoration:none;font-size:14px;font-weight:600">${data.phone}</a></td>
              </tr>
              <tr>
                <td style="font-weight:600;color:#666666;font-size:13px;background:#f9f9f9">Piano Type</td>
                <td style="color:#000000;font-size:14px">${data.pianotype || '<span style="color:#999999">Not specified</span>'}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Pickup Details -->
        <tr>
          <td style="padding:30px 40px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 15px 0;color:#000000;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">📍 Pickup Location</p>
            <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e0e0e0">
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;width:30%;color:#666666;font-size:13px;background:#f9f9f9">Address</td>
                <td style="color:#000000;font-size:14px;font-weight:600">${data.pickup_postcode}</td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;font-size:13px;background:#f9f9f9">Steps</td>
                <td style="color:#000000;font-size:16px;font-weight:700">${data.pickup_steps}</td>
              </tr>
              <tr>
                <td style="font-weight:600;color:#666666;font-size:13px;background:#f9f9f9">Google Maps</td>
                <td><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.pickup_postcode)}" target="_blank" style="color:#000000;text-decoration:underline;font-size:13px;font-weight:600">Open in Maps →</a></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Delivery Details -->
        <tr>
          <td style="padding:30px 40px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 15px 0;color:#000000;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">🚚 Delivery Location</p>
            <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e0e0e0">
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;width:30%;color:#666666;font-size:13px;background:#f9f9f9">Address</td>
                <td style="color:#000000;font-size:14px;font-weight:600">${data.delivery_postcode}</td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;font-size:13px;background:#f9f9f9">Steps</td>
                <td style="color:#000000;font-size:16px;font-weight:700">${data.delivery_steps}</td>
              </tr>
              <tr>
                <td style="font-weight:600;color:#666666;font-size:13px;background:#f9f9f9">Google Maps</td>
                <td><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.delivery_postcode)}" target="_blank" style="color:#000000;text-decoration:underline;font-size:13px;font-weight:600">Open in Maps →</a></td>
              </tr>
            </table>
          </td>
        </tr>

        ${data.specialrequirements ? `
        <!-- Special Requirements -->
        <tr>
          <td style="padding:30px 40px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 15px 0;color:#000000;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">📝 Special Requirements</p>
            <div style="border:1px solid #e0e0e0;padding:15px;background:#f9f9f9">
              <p style="margin:0;color:#333333;font-size:14px;line-height:1.7;white-space:pre-wrap">${data.specialrequirements}</p>
            </div>
          </td>
        </tr>
        ` : ''}

        <!-- Route Button -->
        <tr>
          <td style="padding:30px 40px;text-align:center;border-bottom:1px solid #e0e0e0">
            <a href="https://www.google.com/maps/dir/${encodeURIComponent(data.pickup_postcode)}/${encodeURIComponent(data.delivery_postcode)}" target="_blank" style="display:inline-block;background:#000000;color:#ffffff;padding:14px 36px;text-decoration:none;font-weight:600;font-size:13px;border:2px solid #000000">View Route & Calculate Distance →</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background:#f9f9f9;text-align:center">
            <p style="margin:0;color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:1px">Piano Move Team • Quote Management System</p>
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
// EMAIL FOR CUSTOMER (AUTO-RESPONSE)
// ==========================================
function generateEmailForCustomer(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff">
  
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:20px 0">
  <tr>
    <td align="center">
      
      <!-- Main Container -->
      <table width="650" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid #000000">
        
        <!-- Header -->
        <tr>
          <td style="padding:40px 40px 30px 40px">
            <h1 style="margin:0 0 15px 0;color:#000000;font-size:28px;font-weight:700;letter-spacing:-0.5px">Hi ${data.fullname},</h1>
            <p style="margin:0 0 10px 0;color:#333333;font-size:16px;line-height:1.6">Thank you for requesting a piano moving quote.</p>
            <p style="margin:0;color:#333333;font-size:16px;line-height:1.6">We've received your details and <strong>will contact you shortly</strong> with a personalized quote tailored to your needs.</p>
          </td>
        </tr>

        <!-- Summary Box -->
        <tr>
          <td style="padding:0 40px 30px 40px">
            <table width="100%" cellpadding="20" cellspacing="0" style="border:2px solid #000000">
              <tr>
                <td>
                  <p style="margin:0 0 15px 0;color:#000000;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Your Submission Details</p>
                  <table width="100%" cellpadding="8" cellspacing="0">
                    <tr style="border-bottom:1px solid #e0e0e0">
                      <td style="color:#666666;font-size:14px;width:35%;padding:8px 0">Piano Type</td>
                      <td style="color:#000000;font-size:14px;font-weight:600;padding:8px 0">${data.pianotype || '<span style="color:#999999">Not specified</span>'}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e0e0e0">
                      <td style="color:#666666;font-size:14px;padding:8px 0">Pickup</td>
                      <td style="color:#000000;font-size:14px;padding:8px 0">${data.pickup_postcode} <span style="color:#666666;font-size:13px">(${data.pickup_steps} steps)</span></td>
                    </tr>
                    <tr>
                      <td style="color:#666666;font-size:14px;padding:8px 0">Delivery</td>
                      <td style="color:#000000;font-size:14px;padding:8px 0">${data.delivery_postcode} <span style="color:#666666;font-size:13px">(${data.delivery_steps} steps)</span></td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px">
            <div style="border-top:1px solid #e0e0e0"></div>
          </td>
        </tr>

        <!-- Contact Section -->
        <tr>
          <td style="padding:30px 40px">
            <p style="margin:0 0 20px 0;color:#000000;font-size:18px;font-weight:600;letter-spacing:-0.5px">Need to Reach Us?</p>
            <p style="margin:0 0 20px 0;color:#666666;font-size:14px;line-height:1.6">Have questions or want to discuss your piano move? We're here to help!</p>
            
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 8px 10px 0">
                  <a href="mailto:thenorthpiano@googlemail.com?subject=Piano%20Quote%20-%20${encodeURIComponent(data.fullname)}" style="display:inline-block;background:#000000;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:600;font-size:13px;border:2px solid #000000">Email Us</a>
                </td>
                <td style="padding:0 8px 10px 0">
                  <a href="https://wa.me/447711872434?text=Hi,%20I%20requested%20a%20quote%20for%20moving%20my%20piano" target="_blank" style="display:inline-block;background:#25D366;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:600;font-size:13px;border:2px solid #25D366">WhatsApp</a>
                </td>
                <td style="padding:0 0 10px 0">
                  <a href="tel:08000842902" style="display:inline-block;background:#ffffff;color:#000000;border:2px solid #000000;padding:10px 24px;text-decoration:none;font-weight:600;font-size:13px">Call Free</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Contact Details Table -->
        <tr>
          <td style="padding:0 40px 30px 40px">
            <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #e0e0e0">
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="color:#666666;font-size:13px;width:25%;background:#f9f9f9;font-weight:600">Email</td>
                <td style="padding:12px 15px"><a href="mailto:thenorthpiano@googlemail.com" style="color:#000000;text-decoration:none;font-size:14px">thenorthpiano@googlemail.com</a></td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="color:#666666;font-size:13px;background:#f9f9f9;font-weight:600">Mobile</td>
                <td style="padding:12px 15px"><a href="tel:07711872434" style="color:#000000;text-decoration:none;font-size:14px;font-weight:600">07711 872 434</a></td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="color:#666666;font-size:13px;background:#f9f9f9;font-weight:600">Landline</td>
                <td style="padding:12px 15px"><a href="tel:02034419463" style="color:#000000;text-decoration:none;font-size:14px">020 3441 9463</a></td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="color:#666666;font-size:13px;background:#f9f9f9;font-weight:600">Freephone</td>
                <td style="padding:12px 15px"><a href="tel:08000842902" style="color:#000000;text-decoration:none;font-size:14px">0800 084 2902</a></td>
              </tr>
              <tr>
                <td style="color:#666666;font-size:13px;background:#f9f9f9;font-weight:600">Address</td>
                <td style="padding:12px 15px;color:#000000;font-size:14px">176 Millicent Grove<br/>London N13 6HS</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px">
            <div style="border-top:1px solid #e0e0e0"></div>
          </td>
        </tr>

        <!-- Why Choose Us -->
        <tr>
          <td style="padding:30px 40px">
            <p style="margin:0 0 20px 0;color:#000000;font-size:18px;font-weight:600;letter-spacing:-0.5px">Why Choose The North London Piano?</p>
            
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;width:30px;padding:0 12px 12px 0">
                  <span style="font-size:20px">✓</span>
                </td>
                <td style="vertical-align:top;padding:0 0 12px 0">
                  <p style="margin:0;color:#000000;font-size:14px;font-weight:600">Expert Piano Specialists</p>
                  <p style="margin:3px 0 0 0;color:#666666;font-size:13px;line-height:1.5">Trained professionals with years of experience</p>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;padding:0 12px 12px 0">
                  <span style="font-size:20px">✓</span>
                </td>
                <td style="vertical-align:top;padding:0 0 12px 0">
                  <p style="margin:0;color:#000000;font-size:14px;font-weight:600">Fully Insured Service</p>
                  <p style="margin:3px 0 0 0;color:#666666;font-size:13px;line-height:1.5">Your valuable piano is protected throughout</p>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;padding:0 12px 12px 0">
                  <span style="font-size:20px">✓</span>
                </td>
                <td style="vertical-align:top;padding:0 0 12px 0">
                  <p style="margin:0;color:#000000;font-size:14px;font-weight:600">Professional Equipment</p>
                  <p style="margin:3px 0 0 0;color:#666666;font-size:13px;line-height:1.5">Specialized tools for safe transport</p>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;padding:0 12px 0 0">
                  <span style="font-size:20px">✓</span>
                </td>
                <td style="vertical-align:top;padding:0">
                  <p style="margin:0;color:#000000;font-size:14px;font-weight:600">Trusted in London</p>
                  <p style="margin:3px 0 0 0;color:#666666;font-size:13px;line-height:1.5">Based in North London, serving all areas</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px">
            <div style="border-top:1px solid #e0e0e0"></div>
          </td>
        </tr>

        <!-- Reviews Section -->
        <tr>
          <td style="padding:30px 40px;text-align:center">
            <p style="margin:0 0 10px 0;font-size:32px;letter-spacing:3px;line-height:1">
              <span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span>
            </p>
            <p style="margin:0 0 20px 0;color:#000000;font-size:16px;font-weight:600">Trusted by Hundreds of Satisfied Customers</p>
            <p style="margin:0 0 20px 0;color:#666666;font-size:14px;line-height:1.6">Don't just take our word for it - see what our happy customers say about our professional piano moving services.</p>
            <a href="https://www.google.com/search?q=piano+transport+london+the+north+london+piano" target="_blank" style="display:inline-block;background:#ffffff;color:#000000;border:2px solid #000000;padding:12px 32px;text-decoration:none;font-weight:600;font-size:13px">Read Our Google Reviews →</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:30px 40px;background:#f9f9f9;border-top:2px solid #000000">
            <p style="margin:0 0 5px 0;color:#000000;font-size:15px;font-weight:600">Best regards,</p>
            <p style="margin:0 0 20px 0;color:#000000;font-size:15px;font-weight:600">The North London Piano Team</p>
            
            <div style="border-top:1px solid #e0e0e0;padding-top:15px;margin-top:15px">
              <p style="margin:0;color:#999999;font-size:12px;line-height:1.6">
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
