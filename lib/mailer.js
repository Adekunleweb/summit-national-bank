/* ==========================================================================
   Summit National Bank — Email Notification Module
   Sends professional email notifications to customers for every account action.
   
   Uses Resend API (https://resend.com) — free tier: 3,000 emails/month.
   Falls back to audit-log-only mode if no RESEND_API_KEY is configured.
   
   Required env vars:
     RESEND_API_KEY   — Resend API key (re_xxx...)
     EMAIL_FROM       — Sender address (e.g. "Summit National Bank <noreply@summitbank.com>")
                       Must be a domain verified in your Resend account.
                       If not set, defaults to onboarding@resend.dev (Resend's test domain).
   
   To get started:
   1. Sign up at https://resend.com (free)
   2. Get your API key from the dashboard
   3. (Optional) Add and verify your own domain for professional sender address
   4. Set environment variables in Vercel: 
      vercel env add RESEND_API_KEY
      vercel env add EMAIL_FROM
   ========================================================================== */

const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Summit National Bank <onboarding@resend.dev>';
const BANK_NAME = 'Summit National Bank';
const BANK_URL = process.env.BANK_URL || 'https://summit-bank-one.vercel.app';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@summitbank.com';

/* ---------- Core send function ---------- */
async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    // No API key configured — log to console and return success (graceful degradation)
    console.log(`[EMAIL] (no API key — logging only) To: ${to}, Subject: ${subject}`);
    return { ok: true, simulated: true, message: 'Email not sent — no RESEND_API_KEY configured' };
  }

  if (!to || !to.includes('@')) {
    console.log(`[EMAIL] Skipping — invalid recipient: ${to}`);
    return { ok: false, error: 'Invalid recipient email' };
  }

  const payload = JSON.stringify({
    from: EMAIL_FROM,
    to: to,
    subject: subject,
    html: html,
    text: text || html.replace(/<[^>]*>/g, ''),
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[EMAIL] Sent successfully to ${to}: ${subject}`);
          resolve({ ok: true, messageId: JSON.parse(body).id });
        } else {
          console.error(`[EMAIL] Failed (${res.statusCode}): ${body}`);
          resolve({ ok: false, error: `Resend API error: ${res.statusCode}`, details: body });
        }
      });
    });

    req.on('error', (e) => {
      console.error(`[EMAIL] Network error:`, e.message);
      resolve({ ok: false, error: e.message });
    });

    req.write(payload);
    req.end();
  });
}

/* ---------- Email template wrapper ---------- */
function emailTemplate(title, contentBody) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;">
          
          <!-- Header -->
          <tr>
            <td style="background:#0a1628;padding:32px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:#1e40af;color:#ffffff;font-size:24px;font-weight:700;width:44px;height:44px;text-align:center;border-radius:8px;line-height:44px;">S</td>
                  <td style="padding-left:12px;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:0.5px;">SUMMIT <span style="color:#d4af37;font-size:13px;">NATIONAL BANK</span></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title bar -->
          <tr>
            <td style="background:#1e3a5f;padding:16px 40px;">
              <p style="margin:0;color:#ffffff;font-size:16px;font-weight:600;">${title}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;color:#1f2937;font-size:15px;line-height:1.7;">
              ${contentBody}
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:8px;border:1px solid #fde68a;">
                <tr>
                  <td style="padding:16px 20px;color:#92400e;font-size:13px;line-height:1.5;">
                    <strong>🔒 Security Notice:</strong> Summit National Bank will never ask for your password, PIN, or full Social Security Number via email. If you did not perform this action, please contact our support team immediately at ${SUPPORT_EMAIL} or call 1-800-SUMMIT-1.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0a1628;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px 0;color:#9ca3af;font-size:12px;">© 2024 Summit National Bank, N.A. · Member FDIC · Equal Housing Lender</p>
              <p style="margin:0;color:#6b7280;font-size:11px;">This is an automated notification. Please do not reply to this email.</p>
              <p style="margin:8px 0 0 0;"><a href="${BANK_URL}" style="color:#3b82f6;text-decoration:none;font-size:12px;">Visit Online Banking →</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ---------- Notification functions for each action type ---------- */

// 1. Signup received
async function notifySignupReceived(email, name, appId) {
  return sendEmail({
    to: email,
    subject: `Application Received — ${appId} | ${BANK_NAME}`,
    html: emailTemplate('Account Application Received', `
      <p>Dear ${name},</p>
      <p>Thank you for choosing ${BANK_NAME}. We have received your account application and it is now being processed.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;">
        <tr><td style="color:#6b7280;font-size:13px;">Application ID:</td><td style="color:#1e40af;font-weight:700;font-size:16px;">${appId}</td></tr>
      </table>
      <p>Your application is under review by our team. You will receive another email notification once your account has been approved and activated.</p>
      <p>If you have any questions, please don't hesitate to contact our support team.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services Team</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 2. Signup approved
async function notifySignupApproved(email, name, customerId, acctNo, acctType, openingDeposit) {
  return sendEmail({
    to: email,
    subject: `Welcome to ${BANK_NAME} — Your Account is Active!`,
    html: emailTemplate('Account Approved & Activated', `
      <p>Dear ${name},</p>
      <p><strong>Great news!</strong> Your account application has been approved and your ${BANK_NAME} account is now active.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #e2e8f0;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Customer ID:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${customerId}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Account Number:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;font-family:monospace;">${acctNo}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Account Type:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${acctType}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Opening Deposit:</td><td style="padding:4px 0;color:#059669;font-weight:700;">$${Number(openingDeposit).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p>You can now log in to your online banking portal using your email address and password to access all features including transfers, deposits, crypto deposits, and more.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${BANK_URL}/login" style="background:#1e40af;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Log In to Online Banking →</a>
      </p>
      <p style="margin-top:24px;">Welcome aboard!<br><strong>Account Services Team</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 3. Signup rejected
async function notifySignupRejected(email, name, reason) {
  return sendEmail({
    to: email,
    subject: `Update on Your ${BANK_NAME} Application`,
    html: emailTemplate('Application Status Update', `
      <p>Dear ${name},</p>
      <p>We are writing to inform you about the status of your account application with ${BANK_NAME}.</p>
      <p>After careful review, we are unable to approve your application at this time.</p>
      ${reason ? `<table cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fecaca;"><tr><td style="color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${reason}</td></tr></table>` : ''}
      <p>If you believe this decision was made in error, or if you would like to submit a new application with updated information, please contact our support team.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services Team</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 4. Loan application received
async function notifyLoanReceived(email, name, loanType, amount, loanId) {
  return sendEmail({
    to: email,
    subject: `Loan Application Received — ${loanId} | ${BANK_NAME}`,
    html: emailTemplate('Loan Application Submitted', `
      <p>Dear ${name},</p>
      <p>We have received your loan application and it is now under review.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #e2e8f0;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Application ID:</td><td style="padding:4px 0;color:#1e40af;font-weight:700;">${loanId}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Loan Type:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${loanType}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Requested Amount:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 0})}</td></tr>
      </table>
      <p>Our lending team will review your application and you will be notified once a decision has been made. If approved, funds will be disbursed directly to your checking account.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Lending Team</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 5. Loan approved
async function notifyLoanApproved(email, name, loanType, amount, acctNo, newBalance) {
  return sendEmail({
    to: email,
    subject: `Loan Approved — ${loanType} | ${BANK_NAME}`,
    html: emailTemplate('Loan Application Approved', `
      <p>Dear ${name},</p>
      <p><strong>Congratulations!</strong> Your loan application has been approved and funds have been disbursed to your account.</p>
      <table cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #a7f3d0;">
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Loan Type:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${loanType}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Amount Disbursed:</td><td style="padding:4px 0;color:#059669;font-weight:700;font-size:18px;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 0})}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Credited to Account:</td><td style="padding:4px 0;color:#065f46;font-weight:600;font-family:monospace;">${acctNo}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">New Account Balance:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">$${Number(newBalance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p>Please log in to your online banking portal to view the updated transaction history and manage your loan.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Lending Team</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 6. Loan rejected
async function notifyLoanRejected(email, name, loanType, reason) {
  return sendEmail({
    to: email,
    subject: `Loan Application Update — ${loanType} | ${BANK_NAME}`,
    html: emailTemplate('Loan Application Status', `
      <p>Dear ${name},</p>
      <p>We are writing to update you on your ${loanType} application with ${BANK_NAME}.</p>
      <p>After careful review of your application, we are unable to approve your loan request at this time.</p>
      ${reason ? `<table cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fecaca;"><tr><td style="color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${reason}</td></tr></table>` : ''}
      <p>You may reapply in the future. If you have questions about this decision, please contact our lending team.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Lending Team</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 7. Credit card application received
async function notifyCardReceived(email, name, cardType, reqLimit, cardId) {
  return sendEmail({
    to: email,
    subject: `Credit Card Application Received — ${cardId} | ${BANK_NAME}`,
    html: emailTemplate('Credit Card Application Submitted', `
      <p>Dear ${name},</p>
      <p>We have received your credit card application and it is now <strong>pending approval</strong>. Our team is reviewing your application and supporting details.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #e2e8f0;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Application ID:</td><td style="padding:4px 0;color:#1e40af;font-weight:700;">${cardId}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Card Type:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${cardType}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Requested Limit:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">$${Number(reqLimit).toLocaleString('en-US', {minimumFractionDigits: 0})}</td></tr>
      </table>
      <p>You will receive an email notification once your application has been reviewed and a decision has been made.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Credit Card Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 8. Credit card approved
async function notifyCardApproved(email, name, cardType, cardNoLast4, limit, expiry, securityDeposit) {
  const depAmt = Number(securityDeposit || 0);
  const depFormatted = depAmt.toLocaleString('en-US', { minimumFractionDigits: 0 });
  return sendEmail({
    to: email,
    subject: `Credit Card Approved — ${cardType} | ${BANK_NAME}`,
    html: emailTemplate('Credit Card Application Approved', `
      <p>Dear ${name},</p>
      <p><strong>Congratulations!</strong> Your credit card application has been approved and your new card has been issued.</p>
      <table cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #a7f3d0;">
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Card Type:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${cardType}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Card Number:</td><td style="padding:4px 0;color:#065f46;font-weight:600;font-family:monospace;">•••• •••• •••• ${cardNoLast4}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Credit Limit:</td><td style="padding:4px 0;color:#059669;font-weight:700;font-size:18px;">$${Number(limit).toLocaleString('en-US', {minimumFractionDigits: 0})}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Expires:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${expiry}</td></tr>
      </table>
      ${depAmt > 0 ? `<table cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fcd34d;">
        <tr><td style="color:#92400e;font-size:15px;"><strong>⚠ Refundable Security Deposit Required Before Shipping</strong></td></tr>
        <tr><td style="color:#78350f;font-size:14px;padding-top:8px;">A refundable security deposit of <strong style="font-size:18px;color:#92400e;">$${depFormatted}</strong> is required before your debit card can be shipped to your address on file. This deposit is fully refundable and will be returned to you per the terms of your card agreement. Please log in to your online banking dashboard to view the deposit requirement under your Credit Cards section and arrange payment. Once the refundable security deposit has been received and confirmed by our team, your card will be dispatched.</td></tr>
      </table>
      <p>Your physical card will be mailed to your address on file <strong>after the refundable security deposit has been received</strong>. You can view your card details and the deposit requirement through online banking.</p>` : `<p>Your physical card will be mailed to your address on file. You can view your card details and manage your account through online banking.</p>`}
      <p style="margin-top:24px;">Best regards,<br><strong>Credit Card Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 9. Credit card rejected
async function notifyCardRejected(email, name, cardType, reason) {
  return sendEmail({
    to: email,
    subject: `Credit Card Application Update | ${BANK_NAME}`,
    html: emailTemplate('Credit Card Application Status', `
      <p>Dear ${name},</p>
      <p>We are writing to update you on your ${cardType} application.</p>
      <p>After careful review, we are unable to approve your credit card application at this time.</p>
      ${reason ? `<table cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fecaca;"><tr><td style="color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${reason}</td></tr></table>` : ''}
      <p>If you have questions about this decision, please contact our credit card services team.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Credit Card Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 10. Deposit request received
async function notifyDepositReceived(email, name, depType, amount, depId) {
  return sendEmail({
    to: email,
    subject: `Deposit Request Received — ${depId} | ${BANK_NAME}`,
    html: emailTemplate('Deposit Request Submitted', `
      <p>Dear ${name},</p>
      <p>We have received your deposit request and it is now pending approval.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #e2e8f0;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Request ID:</td><td style="padding:4px 0;color:#1e40af;font-weight:700;">${depId}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Deposit Type:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${depType}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Amount:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p>Your deposit will be credited to your account once it has been approved by our team. You will receive an email notification when the deposit is processed.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 11. Deposit approved
async function notifyDepositApproved(email, name, depType, amount, acctNo, newBalance) {
  return sendEmail({
    to: email,
    subject: `Deposit Credited — ${depType} | ${BANK_NAME}`,
    html: emailTemplate('Deposit Approved & Credited', `
      <p>Dear ${name},</p>
      <p>Your deposit request has been approved and the funds have been credited to your account.</p>
      <table cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #a7f3d0;">
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Deposit Type:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${depType}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Amount Credited:</td><td style="padding:4px 0;color:#059669;font-weight:700;font-size:18px;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Account:</td><td style="padding:4px 0;color:#065f46;font-weight:600;font-family:monospace;">${acctNo}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">New Balance:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">$${Number(newBalance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 12. Deposit rejected
async function notifyDepositRejected(email, name, depType, amount, reason) {
  return sendEmail({
    to: email,
    subject: `Deposit Request Update | ${BANK_NAME}`,
    html: emailTemplate('Deposit Request Status', `
      <p>Dear ${name},</p>
      <p>We are writing to update you on your deposit request (${depType} — $${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2})}).</p>
      <p>Your deposit request could not be processed at this time.</p>
      ${reason ? `<table cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fecaca;"><tr><td style="color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${reason}</td></tr></table>` : ''}
      <p>If you have questions, please contact our support team.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 13. Transfer/Transaction received
async function notifyTransactionReceived(email, name, txnType, amount, recipient, txnId) {
  return sendEmail({
    to: email,
    subject: `Transfer Submitted — ${txnId} | ${BANK_NAME}`,
    html: emailTemplate('Transfer/Payment Submitted', `
      <p>Dear ${name},</p>
      <p>Your ${txnType} request has been submitted and is pending approval.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #e2e8f0;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Reference ID:</td><td style="padding:4px 0;color:#1e40af;font-weight:700;">${txnId}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Type:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${txnType}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Amount:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Recipient:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${recipient}</td></tr>
      </table>
      <p>Your transfer will be processed once it has been approved by our team. You will be notified when the transaction is completed.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 14. Transaction approved
async function notifyTransactionApproved(email, name, txnType, amount, recipient, acctNo, newBalance) {
  return sendEmail({
    to: email,
    subject: `Transfer Completed — ${txnType} | ${BANK_NAME}`,
    html: emailTemplate('Transfer/Payment Processed', `
      <p>Dear ${name},</p>
      <p>Your ${txnType} has been approved and processed successfully.</p>
      <table cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #a7f3d0;">
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Type:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${txnType}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Amount:</td><td style="padding:4px 0;color:#059669;font-weight:700;font-size:18px;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Recipient:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${recipient}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Account:</td><td style="padding:4px 0;color:#065f46;font-weight:600;font-family:monospace;">${acctNo}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">New Balance:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">$${Number(newBalance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 15. Transaction rejected
async function notifyTransactionRejected(email, name, txnType, amount, reason) {
  return sendEmail({
    to: email,
    subject: `Transfer Update — ${txnType} | ${BANK_NAME}`,
    html: emailTemplate('Transfer/Payment Status', `
      <p>Dear ${name},</p>
      <p>We are writing to update you on your ${txnType} request ($${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2})}).</p>
      <p>Your transfer request could not be processed at this time.</p>
      ${reason ? `<table cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fecaca;"><tr><td style="color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${reason}</td></tr></table>` : ''}
      <p>If you have questions, please contact our support team.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 16. Crypto deposit received
async function notifyCryptoReceived(email, name, coin, amount, cryptoId) {
  return sendEmail({
    to: email,
    subject: `Crypto Deposit Received — ${cryptoId} | ${BANK_NAME}`,
    html: emailTemplate('Crypto Deposit Submitted', `
      <p>Dear ${name},</p>
      <p>We have received your cryptocurrency deposit request and it is pending confirmation.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #e2e8f0;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Request ID:</td><td style="padding:4px 0;color:#1e40af;font-weight:700;">${cryptoId}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Cryptocurrency:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${coin}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Amount (USD):</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p>Our team will verify the blockchain transaction and credit your account once confirmed. You will be notified when the deposit is processed.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Crypto Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 17. Crypto deposit approved
async function notifyCryptoApproved(email, name, coin, amount, acctNo, newBalance) {
  return sendEmail({
    to: email,
    subject: `Crypto Deposit Credited — ${coin} | ${BANK_NAME}`,
    html: emailTemplate('Crypto Deposit Confirmed & Credited', `
      <p>Dear ${name},</p>
      <p>Your cryptocurrency deposit has been confirmed and credited to your account.</p>
      <table cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #a7f3d0;">
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Cryptocurrency:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${coin}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Amount Credited:</td><td style="padding:4px 0;color:#059669;font-weight:700;font-size:18px;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Account:</td><td style="padding:4px 0;color:#065f46;font-weight:600;font-family:monospace;">${acctNo}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">New Balance:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">$${Number(newBalance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p style="margin-top:24px;">Best regards,<br><strong>Crypto Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 18. Crypto deposit rejected
async function notifyCryptoRejected(email, name, coin, reason) {
  return sendEmail({
    to: email,
    subject: `Crypto Deposit Update | ${BANK_NAME}`,
    html: emailTemplate('Crypto Deposit Status', `
      <p>Dear ${name},</p>
      <p>We are writing to update you on your ${coin} deposit request.</p>
      <p>Your crypto deposit could not be confirmed at this time.</p>
      ${reason ? `<table cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fecaca;"><tr><td style="color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${reason}</td></tr></table>` : ''}
      <p>If you have questions, please contact our crypto services team.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Crypto Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 19. Gift card deposit received
async function notifyGiftcardReceived(email, name, brand, value, gcId) {
  return sendEmail({
    to: email,
    subject: `Gift Card Deposit Received — ${gcId} | ${BANK_NAME}`,
    html: emailTemplate('Gift Card Deposit Submitted', `
      <p>Dear ${name},</p>
      <p>We have received your gift card deposit request and it is pending review.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #e2e8f0;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Request ID:</td><td style="padding:4px 0;color:#1e40af;font-weight:700;">${gcId}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Gift Card:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${brand}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Value:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">$${Number(value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p>Our team will verify your gift card and credit your account once approved. You will be notified when the deposit is processed.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 20. Gift card approved
async function notifyGiftcardApproved(email, name, brand, value, acctNo, newBalance) {
  return sendEmail({
    to: email,
    subject: `Gift Card Credited — ${brand} | ${BANK_NAME}`,
    html: emailTemplate('Gift Card Deposit Approved & Credited', `
      <p>Dear ${name},</p>
      <p>Your gift card has been verified and the funds have been credited to your account.</p>
      <table cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #a7f3d0;">
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Gift Card:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${brand}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Amount Credited:</td><td style="padding:4px 0;color:#059669;font-weight:700;font-size:18px;">$${Number(value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Account:</td><td style="padding:4px 0;color:#065f46;font-weight:600;font-family:monospace;">${acctNo}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">New Balance:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">$${Number(newBalance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 21. Gift card rejected
async function notifyGiftcardRejected(email, name, brand, reason) {
  return sendEmail({
    to: email,
    subject: `Gift Card Deposit Update | ${BANK_NAME}`,
    html: emailTemplate('Gift Card Deposit Status', `
      <p>Dear ${name},</p>
      <p>We are writing to update you on your ${brand} gift card deposit request.</p>
      <p>Your gift card deposit could not be processed at this time.</p>
      ${reason ? `<table cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fecaca;"><tr><td style="color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${reason}</td></tr></table>` : ''}
      <p>If you have questions, please contact our support team.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 22. Password changed
async function notifyPasswordChanged(email, name) {
  return sendEmail({
    to: email,
    subject: `Password Changed | ${BANK_NAME}`,
    html: emailTemplate('Security Alert — Password Changed', `
      <p>Dear ${name},</p>
      <p>This is to confirm that your online banking password has been successfully changed.</p>
      <table cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fde68a;">
        <tr><td style="color:#92400e;font-size:14px;"><strong>⚠️ Was this you?</strong> If you did not change your password, please contact our support team immediately at ${SUPPORT_EMAIL} or call 1-800-SUMMIT-1.</td></tr>
      </table>
      <p style="margin-top:24px;">Best regards,<br><strong>Security Team</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 23. Email changed
async function notifyEmailChanged(oldEmail, newEmail, name) {
  // Send to both old and new email
  const content = `
    <p>Dear ${name},</p>
    <p>This is to confirm that the email address associated with your ${BANK_NAME} account has been updated.</p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #e2e8f0;">
      <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Previous Email:</td><td style="padding:4px 0;color:#1f2937;font-weight:600;">${oldEmail}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">New Email:</td><td style="padding:4px 0;color:#1e40af;font-weight:600;">${newEmail}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #fde68a;">
      <tr><td style="color:#92400e;font-size:14px;"><strong>⚠️ Was this you?</strong> If you did not request this change, please contact our support team immediately.</td></tr>
    </table>
    <p style="margin-top:24px;">Best regards,<br><strong>Security Team</strong><br>${BANK_NAME}</p>`;
  
  await sendEmail({ to: newEmail, subject: `Email Address Updated | ${BANK_NAME}`, html: emailTemplate('Security Alert — Email Changed', content) });
  if (oldEmail !== newEmail) {
    await sendEmail({ to: oldEmail, subject: `Email Address Updated | ${BANK_NAME}`, html: emailTemplate('Security Alert — Email Changed', content) });
  }
  return { ok: true };
}

// 24. Account frozen
async function notifyAccountFrozen(email, name) {
  return sendEmail({
    to: email,
    subject: `Account Status Update — Account Frozen | ${BANK_NAME}`,
    html: emailTemplate('Account Status Update', `
      <p>Dear ${name},</p>
      <p>This is to inform you that your ${BANK_NAME} account has been frozen.</p>
      <p>During this time, you will not be able to log in to online banking or perform any transactions. This action may have been taken for security reasons or due to suspicious activity.</p>
      <p>To resolve this and restore access to your account, please contact our support team at ${SUPPORT_EMAIL} or call 1-800-SUMMIT-1.</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 25. Account unfrozen
async function notifyAccountUnfrozen(email, name) {
  return sendEmail({
    to: email,
    subject: `Account Restored — Access Reactivated | ${BANK_NAME}`,
    html: emailTemplate('Account Status Update', `
      <p>Dear ${name},</p>
      <p>Good news! Your ${BANK_NAME} account has been reactivated and your access has been restored.</p>
      <p>You can now log in to online banking and resume all banking activities as normal.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${BANK_URL}/login" style="background:#1e40af;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Log In to Online Banking →</a>
      </p>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 26. Manual credit by admin
async function notifyManualCredit(email, name, amount, reason, newBalance) {
  return sendEmail({
    to: email,
    subject: `Account Credited — ${reason} | ${BANK_NAME}`,
    html: emailTemplate('Account Credited', `
      <p>Dear ${name},</p>
      <p>Your account has been credited by ${BANK_NAME}.</p>
      <table cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border:1px solid #a7f3d0;">
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Amount:</td><td style="padding:4px 0;color:#059669;font-weight:700;font-size:18px;">$${Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">Reason:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">${reason}</td></tr>
        <tr><td style="padding:4px 0;color:#065f46;font-size:13px;">New Balance:</td><td style="padding:4px 0;color:#065f46;font-weight:600;">$${Number(newBalance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr>
      </table>
      <p style="margin-top:24px;">Best regards,<br><strong>Account Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

// 27. Admin chat reply
async function notifyChatReply(email, name, message) {
  return sendEmail({
    to: email,
    subject: `New Message from ${BANK_NAME} Support`,
    html: emailTemplate('New Support Message', `
      <p>Dear ${name},</p>
      <p>You have received a new message from our support team:</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin:16px 0;width:100%;border-left:4px solid #1e40af;">
        <tr><td style="color:#1f2937;font-size:15px;line-height:1.6;">${message}</td></tr>
      </table>
      <p style="text-align:center;margin:24px 0;">
        <a href="${BANK_URL}/login" style="background:#1e40af;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">View in Online Banking →</a>
      </p>
      <p style="margin-top:24px;">Best regards,<br><strong>Support Team</strong><br>${BANK_NAME}</p>
    `),
  });
}

// Generic notification (used for security deposit received / card shipped etc.)
async function notifyGeneric(email, name, subject, bodyHtml) {
  return sendEmail({
    to: email,
    subject: `${subject} | ${BANK_NAME}`,
    html: emailTemplate(subject, `
      <p>Dear ${name},</p>
      <p>${bodyHtml}</p>
      <p style="margin-top:24px;">Best regards,<br><strong>Card Services</strong><br>${BANK_NAME}</p>
    `),
  });
}

module.exports = {
  sendEmail,
  emailTemplate,
  notifyGeneric,
  notifySignupReceived,
  notifySignupApproved,
  notifySignupRejected,
  notifyLoanReceived,
  notifyLoanApproved,
  notifyLoanRejected,
  notifyCardReceived,
  notifyCardApproved,
  notifyCardRejected,
  notifyDepositReceived,
  notifyDepositApproved,
  notifyDepositRejected,
  notifyTransactionReceived,
  notifyTransactionApproved,
  notifyTransactionRejected,
  notifyCryptoReceived,
  notifyCryptoApproved,
  notifyCryptoRejected,
  notifyGiftcardReceived,
  notifyGiftcardApproved,
  notifyGiftcardRejected,
  notifyPasswordChanged,
  notifyEmailChanged,
  notifyAccountFrozen,
  notifyAccountUnfrozen,
  notifyManualCredit,
  notifyChatReply,
};
