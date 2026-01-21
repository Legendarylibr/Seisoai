/**
 * Email Templates
 * Reusable HTML email templates for marketing and transactional emails
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://seisoai.com';
const CURRENT_YEAR = new Date().getFullYear();

// Base email wrapper
function baseTemplate(content: string, previewText: string = ''): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>SeisoAI</title>
  <!--[if mso]>
  <style type="text/css">
    table {border-collapse:collapse;border-spacing:0;margin:0;}
    div, td {padding:0;}
    div {margin:0 !important;}
  </style>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    .button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; }
    .button:hover { opacity: 0.9; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 10px !important; }
    }
  </style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  ${previewText ? `<div style="display:none;font-size:1px;color:#f5f5f5;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div>` : ''}
  
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 20px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          ${content}
        </table>
        
        <!-- Footer -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; margin-top: 20px;">
          <tr>
            <td align="center" style="padding: 20px; color: #9ca3af; font-size: 12px;">
              <p style="margin: 0 0 10px 0;">
                <a href="${FRONTEND_URL}" style="color: #667eea; text-decoration: none;">SeisoAI</a> - AI Image, Video & Music Generation
              </p>
              <p style="margin: 0 0 10px 0;">
                <a href="${FRONTEND_URL}/unsubscribe?email={{email}}" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>
              </p>
              <p style="margin: 0;">&copy; ${CURRENT_YEAR} SeisoAI. All rights reserved.</p>
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

// Header component
function headerComponent(title: string, emoji: string = ''): string {
  return `
<tr>
  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">${emoji ? emoji + ' ' : ''}${title}</h1>
  </td>
</tr>
`;
}

// Content wrapper
function contentWrapper(content: string): string {
  return `
<tr>
  <td style="background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
    ${content}
  </td>
</tr>
`;
}

// Button component
function buttonComponent(text: string, url: string): string {
  return `
<div style="text-align: center; margin: 25px 0;">
  <a href="${url}" class="button" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
    ${text}
  </a>
</div>
`;
}

// ==========================================
// WELCOME EMAIL
// ==========================================
export interface WelcomeEmailData {
  userName?: string;
  referralCode: string;
  credits: number;
}

export function welcomeEmail(data: WelcomeEmailData): { html: string; text: string; subject: string } {
  const { userName, referralCode, credits } = data;
  
  const html = baseTemplate(`
${headerComponent('Welcome to SeisoAI!', '🎨')}
${contentWrapper(`
  <p style="font-size: 16px;">Hi${userName ? ` ${userName}` : ''},</p>
  
  <p>Welcome to SeisoAI! You've joined a community of creators using AI to generate amazing images, videos, and music.</p>
  
  <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #166534;">You've received</p>
    <p style="margin: 0; font-size: 32px; font-weight: bold; color: #16a34a;">${credits} FREE Credits</p>
    <p style="margin: 10px 0 0 0; font-size: 14px; color: #166534;">to start creating</p>
  </div>
  
  ${buttonComponent('Start Creating', FRONTEND_URL)}
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  
  <h3 style="color: #333; margin: 0 0 15px 0;">Share & Earn More Credits</h3>
  
  <p>Invite friends and earn <strong>5 credits</strong> for each signup. They'll get the standard <strong>10 credits</strong> on signup!</p>
  
  <div style="background: #faf5ff; border: 1px solid #c084fc; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
    <p style="margin: 0 0 5px 0; font-size: 12px; color: #7c3aed;">Your Referral Code</p>
    <p style="margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #7c3aed;">${referralCode}</p>
    <p style="margin: 10px 0 0 0; font-size: 12px;">
      <a href="${FRONTEND_URL}?ref=${referralCode}" style="color: #7c3aed;">Share this link</a>
    </p>
  </div>
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  
  <h3 style="color: #333; margin: 0 0 15px 0;">What Can You Create?</h3>
  
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="33%" style="padding: 10px; text-align: center; vertical-align: top;">
        <div style="font-size: 32px; margin-bottom: 10px;">🖼️</div>
        <strong>Images</strong>
        <p style="font-size: 12px; color: #6b7280; margin: 5px 0 0 0;">AI art in any style</p>
      </td>
      <td width="33%" style="padding: 10px; text-align: center; vertical-align: top;">
        <div style="font-size: 32px; margin-bottom: 10px;">🎬</div>
        <strong>Videos</strong>
        <p style="font-size: 12px; color: #6b7280; margin: 5px 0 0 0;">Animate your ideas</p>
      </td>
      <td width="33%" style="padding: 10px; text-align: center; vertical-align: top;">
        <div style="font-size: 32px; margin-bottom: 10px;">🎵</div>
        <strong>Music</strong>
        <p style="font-size: 12px; color: #6b7280; margin: 5px 0 0 0;">Generate original tracks</p>
      </td>
    </tr>
  </table>
`)}
`, 'Welcome! You have ' + credits + ' free credits waiting.');

  const text = `
Welcome to SeisoAI!

Hi${userName ? ` ${userName}` : ''},

Welcome to SeisoAI! You've joined a community of creators using AI to generate amazing images, videos, and music.

You've received ${credits} FREE Credits to start creating!

Get started: ${FRONTEND_URL}

---

Share & Earn More Credits

Invite friends and earn 5 credits for each signup. They'll get the standard 10 credits on signup!

Your Referral Code: ${referralCode}
Share this link: ${FRONTEND_URL}?ref=${referralCode}

---

What Can You Create?
- Images: AI art in any style
- Videos: Animate your ideas
- Music: Generate original tracks

---

© ${CURRENT_YEAR} SeisoAI. All rights reserved.
`;

  return { html, text, subject: '🎨 Welcome to SeisoAI! Your free credits are waiting' };
}

// ==========================================
// ONBOARDING EMAIL 1 (24 hours after signup)
// ==========================================
export interface OnboardingEmail1Data {
  userName?: string;
  hasGenerated: boolean;
}

export function onboardingEmail1(data: OnboardingEmail1Data): { html: string; text: string; subject: string } {
  const { userName, hasGenerated } = data;
  
  const content = hasGenerated 
    ? `
      <p>We noticed you've already created some amazing content! Here are some tips to take your creations to the next level:</p>
      
      <ul style="padding-left: 20px;">
        <li><strong>Use detailed prompts</strong> - The more specific, the better results</li>
        <li><strong>Try different styles</strong> - Experiment with anime, cyberpunk, or watercolor</li>
        <li><strong>Upload reference images</strong> - Guide the AI with your own images</li>
      </ul>
    `
    : `
      <p>You haven't used your free credits yet! Here's how to get started in just 60 seconds:</p>
      
      <ol style="padding-left: 20px;">
        <li><strong>Choose a style</strong> - Pick from anime, cyberpunk, or 20+ other styles</li>
        <li><strong>Enter a prompt</strong> - Describe what you want to create</li>
        <li><strong>Click Generate</strong> - Watch the AI bring your idea to life!</li>
      </ol>
    `;
  
  const html = baseTemplate(`
${headerComponent(hasGenerated ? 'Level Up Your Creations' : 'Get Started in 60 Seconds', '✨')}
${contentWrapper(`
  <p style="font-size: 16px;">Hi${userName ? ` ${userName}` : ''},</p>
  
  ${content}
  
  ${buttonComponent(hasGenerated ? 'Create Something New' : 'Try It Now', FRONTEND_URL)}
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  
  <h3 style="color: #333; margin: 0 0 15px 0;">Pro Tip: Use Prompt Optimization</h3>
  
  <p>Our AI prompt optimizer can enhance your prompts for better results. Just click the "Optimize" button when entering your prompt!</p>
  
  <p style="color: #6b7280; font-size: 14px;">Need help? Check out our <a href="${FRONTEND_URL}/help" style="color: #667eea;">getting started guide</a>.</p>
`)}
`, hasGenerated ? 'Tips to level up your AI creations' : 'Your free credits are waiting - start creating!');

  const text = `
${hasGenerated ? 'Level Up Your Creations' : 'Get Started in 60 Seconds'}

Hi${userName ? ` ${userName}` : ''},

${hasGenerated 
  ? `We noticed you've already created some amazing content! Here are some tips:
- Use detailed prompts - The more specific, the better results
- Try different styles - Experiment with anime, cyberpunk, or watercolor
- Upload reference images - Guide the AI with your own images`
  : `You haven't used your free credits yet! Here's how to get started:
1. Choose a style - Pick from anime, cyberpunk, or 20+ other styles
2. Enter a prompt - Describe what you want to create
3. Click Generate - Watch the AI bring your idea to life!`
}

Get started: ${FRONTEND_URL}

Pro Tip: Use Prompt Optimization
Our AI prompt optimizer can enhance your prompts for better results.

© ${CURRENT_YEAR} SeisoAI. All rights reserved.
`;

  return { 
    html, 
    text, 
    subject: hasGenerated ? '✨ Tips to level up your AI creations' : '✨ Your free credits are waiting!' 
  };
}

// ==========================================
// ONBOARDING EMAIL 2 (3 days after signup)
// ==========================================
export interface OnboardingEmail2Data {
  userName?: string;
  generationCount: number;
}

export function onboardingEmail2(data: OnboardingEmail2Data): { html: string; text: string; subject: string } {
  const { userName, generationCount } = data;
  
  const html = baseTemplate(`
${headerComponent('Discover More Features', '🚀')}
${contentWrapper(`
  <p style="font-size: 16px;">Hi${userName ? ` ${userName}` : ''},</p>
  
  ${generationCount > 0 
    ? `<p>You've created <strong>${generationCount} generation${generationCount > 1 ? 's' : ''}</strong> so far - awesome! Did you know SeisoAI can do even more?</p>`
    : `<p>Did you know SeisoAI offers more than just image generation?</p>`
  }
  
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
    <tr>
      <td style="padding: 15px; background: #eff6ff; border-radius: 8px; margin-bottom: 10px;">
        <h4 style="margin: 0 0 5px 0; color: #1e40af;">🎬 Video Generation</h4>
        <p style="margin: 0; font-size: 14px; color: #3b82f6;">Transform images into stunning 4-8 second AI videos</p>
      </td>
    </tr>
    <tr><td style="height: 10px;"></td></tr>
    <tr>
      <td style="padding: 15px; background: #f0fdf4; border-radius: 8px; margin-bottom: 10px;">
        <h4 style="margin: 0 0 5px 0; color: #166534;">🎵 Music Generation</h4>
        <p style="margin: 0; font-size: 14px; color: #22c55e;">Create original music in 50+ genres</p>
      </td>
    </tr>
    <tr><td style="height: 10px;"></td></tr>
    <tr>
      <td style="padding: 15px; background: #fef3c7; border-radius: 8px;">
        <h4 style="margin: 0 0 5px 0; color: #92400e;">📦 3D Model Generation</h4>
        <p style="margin: 0; font-size: 14px; color: #f59e0b;">Convert images to 3D models you can download</p>
      </td>
    </tr>
  </table>
  
  ${buttonComponent('Explore All Features', FRONTEND_URL)}
`)}
`, 'Discover video, music, and 3D model generation');

  const text = `
Discover More Features

Hi${userName ? ` ${userName}` : ''},

${generationCount > 0 
  ? `You've created ${generationCount} generation${generationCount > 1 ? 's' : ''} so far - awesome! Did you know SeisoAI can do even more?`
  : `Did you know SeisoAI offers more than just image generation?`
}

More Features:
- Video Generation: Transform images into stunning 4-8 second AI videos
- Music Generation: Create original music in 50+ genres
- 3D Model Generation: Convert images to 3D models you can download

Explore: ${FRONTEND_URL}

© ${CURRENT_YEAR} SeisoAI. All rights reserved.
`;

  return { html, text, subject: '🚀 Discover video, music & 3D generation' };
}

// ==========================================
// LOW CREDITS REMINDER
// ==========================================
export interface LowCreditsEmailData {
  userName?: string;
  credits: number;
  referralCode: string;
}

export function lowCreditsEmail(data: LowCreditsEmailData): { html: string; text: string; subject: string } {
  const { userName, credits, referralCode } = data;
  
  const html = baseTemplate(`
${headerComponent('Running Low on Credits', '💰')}
${contentWrapper(`
  <p style="font-size: 16px;">Hi${userName ? ` ${userName}` : ''},</p>
  
  <p>You have <strong>${credits} credit${credits !== 1 ? 's' : ''}</strong> remaining. Here's how to get more:</p>
  
  <div style="background: #faf5ff; border: 1px solid #c084fc; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h4 style="margin: 0 0 10px 0; color: #7c3aed;">🎁 Earn Free Credits</h4>
    <p style="margin: 0; font-size: 14px;">Invite friends with your code <strong>${referralCode}</strong> and earn 5 credits for each signup!</p>
  </div>
  
  ${buttonComponent('Get More Credits', `${FRONTEND_URL}/pricing`)}
  
  <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
    Our plans start at just $10/month with up to 30% savings on credits.
  </p>
`)}
`, `You have ${credits} credit${credits !== 1 ? 's' : ''} remaining`);

  const text = `
Running Low on Credits

Hi${userName ? ` ${userName}` : ''},

You have ${credits} credit${credits !== 1 ? 's' : ''} remaining. Here's how to get more:

Earn Free Credits:
Invite friends with your code ${referralCode} and earn 5 credits for each signup!

Or view our plans: ${FRONTEND_URL}/pricing
Plans start at just $10/month with up to 30% savings.

© ${CURRENT_YEAR} SeisoAI. All rights reserved.
`;

  return { html, text, subject: '💰 Running low on credits - here\'s how to get more' };
}

// ==========================================
// WIN-BACK EMAIL (30 days inactive)
// ==========================================
export interface WinBackEmailData {
  userName?: string;
  lastActiveDate: Date;
  credits: number;
}

export function winBackEmail(data: WinBackEmailData): { html: string; text: string; subject: string } {
  const { userName, credits } = data;
  
  const html = baseTemplate(`
${headerComponent('We Miss You!', '👋')}
${contentWrapper(`
  <p style="font-size: 16px;">Hi${userName ? ` ${userName}` : ''},</p>
  
  <p>It's been a while since you visited SeisoAI. We've added some exciting new features:</p>
  
  <ul style="padding-left: 20px;">
    <li>New AI models with better quality and faster generation</li>
    <li>Improved video generation with longer durations</li>
    <li>More style presets and customization options</li>
  </ul>
  
  ${credits > 0 ? `
  <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
    <p style="margin: 0; font-size: 14px; color: #166534;">You still have <strong>${credits} credit${credits !== 1 ? 's' : ''}</strong> waiting to be used!</p>
  </div>
  ` : ''}
  
  ${buttonComponent('Come Back & Create', FRONTEND_URL)}
`)}
`, 'We miss you! Come back and see what\'s new');

  const text = `
We Miss You!

Hi${userName ? ` ${userName}` : ''},

It's been a while since you visited SeisoAI. We've added some exciting new features:
- New AI models with better quality and faster generation
- Improved video generation with longer durations
- More style presets and customization options

${credits > 0 ? `You still have ${credits} credit${credits !== 1 ? 's' : ''} waiting to be used!` : ''}

Come back: ${FRONTEND_URL}

© ${CURRENT_YEAR} SeisoAI. All rights reserved.
`;

  return { html, text, subject: '👋 We miss you! Come back and see what\'s new' };
}

export default {
  welcomeEmail,
  onboardingEmail1,
  onboardingEmail2,
  lowCreditsEmail,
  winBackEmail
};
