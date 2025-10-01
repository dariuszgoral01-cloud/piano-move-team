const { Resend } = require('resend');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
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

    const customerAttachments = [];
    if (data.attachments && Array.isArray(data.attachments)) {
      for (const file of data.attachments) {
        if (file.content && file.filename) {
          customerAttachments.push({
            filename: file.filename,
            content: Buffer.from(file.content, 'base64'),
          });
        }
      }
    }

    const jobRef = `PMT-${Date.now().toString().slice(-6)}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    console.log(`Quote from ${data.fullname} - Generating PDF...`);

    const pdfBuffer = await generateJobSheetPDF(data, jobRef);
    
    // Upload PDF to Supabase
    const pdfFileName = `job-sheets/${jobRef}-${timestamp}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('piano-quotes')
      .upload(pdfFileName, pdfBuffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      throw new Error('Failed to upload PDF to storage');
    }

    const { data: urlData } = supabase.storage
      .from('piano-quotes')
      .getPublicUrl(pdfFileName);

    const pdfPublicUrl = urlData.publicUrl;
    console.log('PDF uploaded to Supabase:', pdfPublicUrl);

    // Generate and upload VCF to Supabase
    const vcfBuffer = generateVCF();
    const vcfFileName = `vcf/The-North-London-Piano.vcf`;
    
    // Upload VCF (upsert: true so we reuse the same file)
    const { error: vcfUploadError } = await supabase.storage
      .from('piano-quotes')
      .upload(vcfFileName, vcfBuffer, {
        contentType: 'text/vcard',
        cacheControl: '3600',
        upsert: true
      });

    if (vcfUploadError && vcfUploadError.message !== 'The resource already exists') {
      console.error('VCF upload error:', vcfUploadError);
    }

    // Get public URL for VCF
    const { data: vcfUrlData } = supabase.storage
      .from('piano-quotes')
      .getPublicUrl(vcfFileName);

    const vcfPublicUrl = vcfUrlData.publicUrl;
    console.log('VCF uploaded to Supabase:', vcfPublicUrl);

    const calLink = generateCalendarLink(data);
    const waLink = generateWhatsAppLink(data);
    const slug = data.fullname.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const threadId = `<quote-${slug}@pianomoveteam.co.uk>`;

    const allAttachments = [
      ...customerAttachments,
      {
        filename: `Job-Sheet-${jobRef}.pdf`,
        content: pdfBuffer,
      }
    ];

    await supabase.from('quotes').insert({
      job_ref: jobRef,
      customer_name: data.fullname,
      customer_email: data.email,
      customer_phone: data.phone,
      piano_type: data.pianotype,
      pickup_postcode: data.pickup_postcode,
      pickup_steps: data.pickup_steps,
      delivery_postcode: data.delivery_postcode,
      delivery_steps: data.delivery_steps,
      special_requirements: data.specialrequirements,
      pdf_url: pdfPublicUrl,
      attachments_count: customerAttachments.length,
      created_at: new Date().toISOString()
    });

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Piano Quote <quotes@pianomoveteam.co.uk>',
      to: ['thenorthpiano@googlemail.com'],
      cc: ['gogoo.ltd@gmail.com'],
      replyTo: data.email,
      subject: `Piano Quote - ${data.fullname}${customerAttachments.length > 0 ? ' (' + customerAttachments.length + ' photos)' : ''} + PDF`,
      html: generateEmailForYou(data, calLink, waLink, customerAttachments.length, jobRef, pdfPublicUrl),
      attachments: allAttachments,
      headers: {
        'References': threadId,
        'In-Reply-To': threadId,
        'X-Entity-Ref-ID': 'customer-' + slug,
      },
    });

    if (emailError) {
      console.error('Resend error (business email):', emailError);
      return res.status(500).json({ error: emailError.message });
    }

    console.log('Business email sent. ID:', emailData?.id);

    // Email TO CUSTOMER with VCF link
    const { data: customerEmailData, error: customerEmailError } = await resend.emails.send({
      from: 'Piano Move Team <noreply@pianomoveteam.co.uk>',
      to: [data.email],
      subject: 'Thank you for your piano moving quote request',
      html: generateEmailForCustomer(data, vcfPublicUrl),
    });

    if (customerEmailError) {
      console.error('Resend error (customer email):', customerEmailError);
    } else {
      console.log('Customer email sent to', data.email);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Quote sent successfully',
      emailId: emailData?.id,
      customerEmailId: customerEmailData?.id,
      pdfUrl: pdfPublicUrl,
      vcfUrl: vcfPublicUrl,
      jobRef: jobRef,
      attachments: allAttachments.length
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ==========================================
// GENERATE VCF FILE
// ==========================================
function generateVCF() {
  const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:The North London Piano
ORG:The North London Piano
TEL;TYPE=WORK,VOICE:02034419463
TEL;TYPE=CELL:07711872434
EMAIL:thenorthpiano@googlemail.com
ADR;TYPE=WORK:;;176 Millicent Grove;London;;N13 6HS;UK
URL:https://www.pianomoveteam.co.uk
END:VCARD`;
  
  return Buffer.from(vcfContent, 'utf-8');
}

// ==========================================
// PDF - ONE PAGE ONLY
// ==========================================
async function generateJobSheetPDF(data, jobRef) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 25,
      info: {
        Title: `Job Sheet ${jobRef}`,
        Author: 'The North London Piano',
        Subject: `Piano Move - ${data.fullname}`,
      }
    });
    
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = new Date();
    const jobDate = today.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });

    // === HEADER ===
    doc.rect(25, 25, doc.page.width - 50, 60)
       .lineWidth(2)
       .stroke('#000000');
    
    doc.fontSize(25).fillColor('#000000').font('Helvetica-Bold')
       .text('JOB SHEET', 35, 35);
    
    doc.fontSize(10).fillColor('#666666').font('Helvetica')
       .text('The North London Piano', 35, 65);
    
    doc.fontSize(11).fillColor('#000000').font('Helvetica-Bold')
       .text(`REF: ${jobRef}`, doc.page.width - 150, 35, { width: 120, align: 'right' });
    
    doc.fontSize(9).fillColor('#666666').font('Helvetica')
       .text(`Date: ${jobDate}`, doc.page.width - 150, 55, { width: 120, align: 'right' });

    let yPos = 100;

    // === CUSTOMER DETAILS ===
    doc.fontSize(12).fillColor('#000000').font('Helvetica-Bold')
       .text('CUSTOMER DETAILS', 35, yPos);
    
    yPos += 15;
    
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
       .text('Name:', 35, yPos);
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(data.fullname, 85, yPos);
    yPos += 14;
    
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
       .text('Phone:', 35, yPos);
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(data.phone, 85, yPos);
    yPos += 14;
    
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
       .text('Email:', 35, yPos);
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(data.email, 85, yPos);
    yPos += 14;
    
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
       .text('Piano Type:', 35, yPos);
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
       .text(data.pianotype || 'Not specified', 85, yPos);
    yPos += 18;

    doc.moveTo(35, yPos).lineTo(doc.page.width - 35, yPos).lineWidth(0.5).stroke('#cccccc');
    yPos += 15;

    // === PICKUP LOCATION ===
    doc.fontSize(12).fillColor('#000000').font('Helvetica-Bold')
       .text('PICKUP LOCATION', 35, yPos);
    
    yPos += 15;
    const boxHeight = 45;
    doc.rect(35, yPos, doc.page.width - 70, boxHeight)
       .lineWidth(1.5)
       .stroke('#000000');
    
    doc.fontSize(11).fillColor('#999999').font('Helvetica-Bold')
       .text('ADDRESS:', 45, yPos + 10);
    doc.fontSize(11).fillColor('#000000').font('Helvetica-Bold')
       .text(data.pickup_postcode, 45, yPos + 22, { width: 260 });
    
    const stepsX = doc.page.width - 110;
    doc.fontSize(11).fillColor('#999999').font('Helvetica-Bold')
       .text('STEPS:', stepsX, yPos + 10);
    doc.fontSize(22).fillColor('#000000').font('Helvetica-Bold')
       .text(data.pickup_steps.toString(), stepsX, yPos + 20);

    yPos += boxHeight + 15;

    // === DELIVERY LOCATION ===
    doc.fontSize(12).fillColor('#000000').font('Helvetica-Bold')
       .text('DELIVERY LOCATION', 35, yPos);
    
    yPos += 15;
    doc.rect(35, yPos, doc.page.width - 70, boxHeight)
       .lineWidth(1.5)
       .stroke('#000000');
    
    doc.fontSize(11).fillColor('#999999').font('Helvetica-Bold')
       .text('ADDRESS:', 45, yPos + 10);
    doc.fontSize(11).fillColor('#000000').font('Helvetica-Bold')
       .text(data.delivery_postcode, 45, yPos + 22, { width: 260 });
    
    doc.fontSize(11).fillColor('#999999').font('Helvetica-Bold')
       .text('STEPS:', stepsX, yPos + 10);
    doc.fontSize(22).fillColor('#000000').font('Helvetica-Bold')
       .text(data.delivery_steps.toString(), stepsX, yPos + 20);

    yPos += boxHeight + 15;

    // === SPECIAL REQUIREMENTS ===
    if (data.specialrequirements) {
      doc.fontSize(12).fillColor('#000000').font('Helvetica-Bold')
         .text('SPECIAL REQUIREMENTS', 35, yPos);
      
      yPos += 15;
      
      const textHeight = Math.min(40, doc.heightOfString(data.specialrequirements, {
        width: doc.page.width - 90,
        lineGap: 1
      }) + 15);
      
      doc.rect(35, yPos, doc.page.width - 70, textHeight)
         .fillAndStroke('#FFFEF0', '#000000');
      
      doc.fontSize(12).fillColor('#000000').font('Helvetica')
         .text(data.specialrequirements, 45, yPos + 10, { 
           width: doc.page.width - 90,
           lineGap: 1
         });
      
      yPos += textHeight + 12;
    }

    // === NOTES / QUOTE ===
    doc.fontSize(12).fillColor('#000000').font('Helvetica-Bold')
       .text('NOTES / QUOTE', 35, yPos);
    
    yPos += 15;
    
    // Zmniejszamy wysokość ramki notes, aby zmieścić wszystko
    const notesHeight = 45;
    doc.rect(35, yPos, doc.page.width - 70, notesHeight)
       .lineWidth(1)
       .stroke('#000000');
    
    doc.fontSize(11).fillColor('#999999').font('Helvetica')
       .text('Space for notes, quote amount, and additional information...', 45, yPos + 15);

    yPos += notesHeight + 15;

    // === SIGNATURES ===
    const sigWidth = (doc.page.width - 90) / 2;
    
    doc.fontSize(12).fillColor('#000000').font('Helvetica-Bold')
       .text('CREW SIGNATURE:', 35, yPos);
    doc.moveTo(35, yPos + 20).lineTo(35 + sigWidth, yPos + 20)
       .lineWidth(1)
       .stroke('#000000');
    
    doc.fontSize(12).fillColor('#000000').font('Helvetica-Bold')
       .text('CUSTOMER SIGNATURE:', doc.page.width / 2 + 5, yPos);
    doc.moveTo(doc.page.width / 2 + 5, yPos + 20)
       .lineTo(doc.page.width - 35, yPos + 20)
       .lineWidth(1)
       .stroke('#000000');

    yPos += 40;

    // === FOOTER - PODNOSIMY DO GÓRY I USUWAMY RAMKĘ ===
    const footerY = yPos;
    
    // Usuwamy ramkę i po prostu wyświetlamy tekst
    doc.fontSize(10).fillColor('#000000').font('Helvetica-Bold')
       .text('The North London Piano • 176 Millicent Grove, London N13 6HS', 
             35, footerY, { 
               align: 'center', 
               width: doc.page.width - 70 
             });
    
    doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold')
       .text('Tel: 020 3441 9463 • Mobile: 07711 872 434 • Email: thenorthpiano@googlemail.com',
             35, footerY + 12, { 
               align: 'center', 
               width: doc.page.width - 70 
             });

    doc.end();
  });
}

// ==========================================
// EMAIL FOR BUSINESS
// ==========================================
function generateEmailForYou(data, calLink, waLink, attachCount, jobRef, pdfUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .button-row td { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
      .button { width: 100% !important; display: block !important; }
      h1 { font-size: 22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f5f5">
  
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px 0">
  <tr>
    <td align="center">
      
      <table class="container" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid #000000;max-width:600px">
        
        <tr>
          <td style="padding:30px;border-bottom:3px solid #000000">
            <h1 style="margin:0;color:#000000;font-size:24px;font-weight:700">New Piano Moving Quote Request</h1>
            <p style="margin:10px 0 0 0;color:#666666;font-size:15px">${new Date().toLocaleString('en-GB', {timeZone:'Europe/London',dateStyle:'full',timeStyle:'short'})}</p>
          </td>
        </tr>

        ${attachCount > 0 ? `
        <tr>
          <td style="padding:20px 30px;background:#f9f9f9;border-bottom:1px solid #e0e0e0">
            <p style="margin:0;color:#000000;font-size:16px;font-weight:600">${attachCount} Customer Photo${attachCount > 1 ? 's' : ''} Attached</p>
          </td>
        </tr>
        ` : ''}

        <tr>
          <td style="padding:30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 20px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase">Quick Actions</p>
            
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr class="button-row">
                <td width="49%" style="padding:0 1% 12px 0;vertical-align:top">
                  <a href="${calLink}" target="_blank" class="button" style="display:block;background:#4A90E2;color:#ffffff;padding:15px 10px;text-decoration:none;font-weight:600;font-size:14px;border-radius:6px;text-align:center">Add to Calendar</a>
                </td>
                <td width="49%" style="padding:0 0 12px 1%;vertical-align:top">
                  <a href="tel:+44${data.phone.replace(/^0/, '').replace(/[^0-9]/g, '')}" class="button" style="display:block;background:#FF6B6B;color:#ffffff;padding:15px 10px;text-decoration:none;font-weight:600;font-size:14px;border-radius:6px;text-align:center">Call Now</a>
                </td>
              </tr>
              <tr class="button-row">
                <td width="49%" style="padding:0 1% 0 0;vertical-align:top">
                  <a href="${waLink}" target="_blank" class="button" style="display:block;background:#25D366;color:#ffffff;padding:15px 10px;text-decoration:none;font-weight:600;font-size:14px;border-radius:6px;text-align:center">WhatsApp</a>
                </td>
                <td width="49%" style="padding:0 0 0 1%;vertical-align:top">
                  <a href="${pdfUrl}" target="_blank" class="button" style="display:block;background:#9B59B6;color:#ffffff;padding:15px 10px;text-decoration:none;font-weight:600;font-size:14px;border-radius:6px;text-align:center">Print Job Sheet</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase">Customer Information</p>
            <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #e0e0e0">
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;width:30%;color:#666666;background:#f9f9f9;font-size:14px">Name</td>
                <td style="color:#000000;font-weight:600;font-size:15px">${data.fullname}</td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;background:#f9f9f9;font-size:14px">Email</td>
                <td><a href="mailto:${data.email}" style="color:#000000;text-decoration:none;font-size:15px">${data.email}</a></td>
              </tr>
              <tr style="border-bottom:1px solid #e0e0e0">
                <td style="font-weight:600;color:#666666;background:#f9f9f9;font-size:14px">Phone</td>
                <td><a href="tel:${data.phone}" style="color:#000000;font-weight:700;text-decoration:none;font-size:16px">${data.phone}</a></td>
              </tr>
              <tr>
                <td style="font-weight:600;color:#666666;background:#f9f9f9;font-size:14px">Piano</td>
                <td style="color:#000000;font-size:15px">${data.pianotype || 'Not specified'}</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600">Pickup Location</p>
            <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #e0e0e0;background:#f9f9f9">
              <tr>
                <td style="width:30%;color:#666666;font-weight:600;font-size:14px">Address</td>
                <td style="color:#000000;font-weight:700;font-size:16px">${data.pickup_postcode}</td>
              </tr>
              <tr>
                <td style="color:#666666;font-weight:600;font-size:14px">Steps</td>
                <td style="color:#000000;font-weight:700;font-size:20px">${data.pickup_steps}</td>
              </tr>
              <tr>
                <td style="color:#666666;font-weight:600;font-size:14px">Maps</td>
                <td><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.pickup_postcode)}" target="_blank" style="color:#000000;text-decoration:underline;font-weight:600;font-size:14px">Open in Google Maps</a></td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600">Delivery Location</p>
            <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #e0e0e0;background:#f9f9f9">
              <tr>
                <td style="width:30%;color:#666666;font-weight:600;font-size:14px">Address</td>
                <td style="color:#000000;font-weight:700;font-size:16px">${data.delivery_postcode}</td>
              </tr>
              <tr>
                <td style="color:#666666;font-weight:600;font-size:14px">Steps</td>
                <td style="color:#000000;font-weight:700;font-size:20px">${data.delivery_steps}</td>
              </tr>
              <tr>
                <td style="color:#666666;font-weight:600;font-size:14px">Maps</td>
                <td><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.delivery_postcode)}" target="_blank" style="color:#000000;text-decoration:underline;font-weight:600;font-size:14px">Open in Google Maps</a></td>
              </tr>
            </table>
          </td>
        </tr>

        ${data.specialrequirements ? `
        <tr>
          <td style="padding:30px;border-bottom:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600">Special Requirements</p>
            <div style="border:2px solid #e0e0e0;padding:18px;background:#fffacd;border-radius:6px">
              <p style="margin:0;color:#333333;font-size:15px;line-height:1.6;white-space:pre-wrap">${data.specialrequirements}</p>
            </div>
          </td>
        </tr>
        ` : ''}

        <tr>
          <td style="padding:25px 30px;text-align:center">
            <a href="https://www.google.com/maps/dir/${encodeURIComponent(data.pickup_postcode)}/${encodeURIComponent(data.delivery_postcode)}" target="_blank" style="display:inline-block;background:#000000;color:#ffffff;padding:16px 32px;text-decoration:none;font-weight:600;font-size:16px;border-radius:6px">View Route & Distance</a>
          </td>
        </tr>

        <tr>
          <td style="padding:25px 30px;background:#f9f9f9;text-align:center;border-top:2px solid #000000">
            <p style="margin:0;color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:1px">Piano Move Team • Quote Management</p>
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

function generateCalendarLink(data) {
  const eventTitle = `Piano Move - ${data.fullname}`;
  const eventDesc = `Customer: ${data.fullname}\nPhone: ${data.phone}\nEmail: ${data.email}\nPiano: ${data.pianotype || 'Not specified'}\nPickup: ${data.pickup_postcode} (${data.pickup_steps} steps)\nDelivery: ${data.delivery_postcode} (${data.delivery_steps} steps)\n\nSpecial: ${data.specialrequirements || 'None'}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventTitle)}&details=${encodeURIComponent(eventDesc)}&location=${encodeURIComponent(data.pickup_postcode + ' to ' + data.delivery_postcode)}`;
}

function generateWhatsAppLink(data) {
  return `https://wa.me/${data.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hi ' + data.fullname + ', thank you for your piano moving quote request. I would like to discuss the details with you.')}`;
}

// ==========================================
// EMAIL FOR CUSTOMER - WITH VCF URL
// ==========================================
function generateEmailForCustomer(data, vcfUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .button-row td { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
      .button { width: 100% !important; display: block !important; }
      h1 { font-size: 26px !important; }
      .text { font-size: 17px !important; }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f5f5">
  
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px 0">
  <tr>
    <td align="center">
      
      <table class="container" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid #000000;max-width:600px">
        
        <tr>
          <td style="padding:40px 30px 30px 30px">
            <h1 style="margin:0 0 18px 0;color:#000000;font-size:30px;font-weight:700">Hi ${data.fullname},</h1>
            <p class="text" style="margin:0 0 12px 0;color:#333333;font-size:18px;line-height:1.6">Thank you for requesting a piano moving quote.</p>
            <p class="text" style="margin:0;color:#333333;font-size:18px;line-height:1.6">We've received your details and <strong>will contact you shortly</strong> with a personalized quote.</p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 30px 30px">
            <table width="100%" cellpadding="22" cellspacing="0" style="border:2px solid #000000;border-radius:8px">
              <tr>
                <td>
                  <p style="margin:0 0 18px 0;color:#000000;font-size:16px;font-weight:600;text-transform:uppercase">Your Submission</p>
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
          <td style="padding:30px;border-top:1px solid #e0e0e0">
            <p style="margin:0 0 20px 0;color:#000000;font-size:20px;font-weight:600">Need to Reach Us?</p>
            <p class="text" style="margin:0 0 24px 0;color:#666666;font-size:17px;line-height:1.6">Have questions or want to discuss your piano move? We're here to help!</p>
            
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr class="button-row">
                <td width="32%" style="padding:0 1% 0 0;vertical-align:top">
                  <a href="mailto:thenorthpiano@googlemail.com?subject=Piano%20Quote%20-%20${encodeURIComponent(data.fullname)}" class="button" style="display:block;background:#000000;color:#ffffff;padding:16px 10px;text-decoration:none;font-weight:600;font-size:15px;border-radius:6px;text-align:center">Email Us</a>
                </td>
                <td width="32%" style="padding:0 1%;vertical-align:top">
                  <a href="tel:02034419463" class="button" style="display:block;background:#FF6B6B;color:#ffffff;padding:16px 10px;text-decoration:none;font-weight:600;font-size:15px;border-radius:6px;text-align:center">Call Us</a>
                </td>
                <td width="32%" style="padding:0 0 0 1%;vertical-align:top">
                  <a href="https://wa.me/447711872434?text=Hi,%20I%20requested%20a%20quote%20for%20moving%20my%20piano" target="_blank" class="button" style="display:block;background:#25D366;color:#ffffff;padding:16px 10px;text-decoration:none;font-weight:600;font-size:15px;border-radius:6px;text-align:center">WhatsApp</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:30px;text-align:center;border-top:1px solid #e0e0e0">
            <p style="margin:0 0 18px 0;color:#000000;font-size:20px;font-weight:600">Save Our Contact</p>
            <p class="text" style="margin:0 0 24px 0;color:#666666;font-size:17px;line-height:1.6">Add us to your phone contacts for easy access next time you need us.</p>
            <a href="${vcfUrl}" download="The-North-London-Piano.vcf" class="button" style="display:inline-block;background:#000000;color:#ffffff;padding:18px 42px;text-decoration:none;font-weight:600;font-size:17px;border-radius:6px">Add to Contacts</a>
            <p style="margin:20px 0 0 0;color:#999999;font-size:14px">One tap - all our contact info saved!</p>
          </td>
        </tr>

        <tr>
          <td style="padding:30px;border-top:1px solid #e0e0e0">
            <p style="margin:0 0 24px 0;color:#000000;font-size:20px;font-weight:600">Why Choose The North London Piano?</p>
            
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
          <td style="padding:30px;text-align:center;border-top:1px solid #e0e0e0">
            <p style="margin:0 0 15px 0;font-size:38px;letter-spacing:4px;line-height:1">
              <span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span><span style="color:#FFD700">★</span>
            </p>
            <p style="margin:0 0 20px 0;color:#000000;font-size:19px;font-weight:600">Trusted by Hundreds of Satisfied Customers</p>
            <p class="text" style="margin:0 0 24px 0;color:#666666;font-size:17px;line-height:1.6">Don't just take our word for it - see what our happy customers say about our professional piano moving services.</p>
            <a href="https://www.google.com/search?q=piano+transport+london+the+north+london+piano" target="_blank" class="button" style="display:inline-block;background:#ffffff;color:#000000;border:2px solid #000000;padding:16px 36px;text-decoration:none;font-weight:600;font-size:16px;border-radius:6px">Read Our Google Reviews</a>
          </td>
        </tr>

        <tr>
          <td style="padding:30px;background:#f9f9f9;border-top:2px solid #000000">
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
