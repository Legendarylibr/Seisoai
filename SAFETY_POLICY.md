# AI Image Generator Safety Policy

## CSAM Protection with Permissive Content Policy

This document outlines the safety measures implemented to protect against CSAM (Child Sexual Abuse Material) while allowing explicit adult content and hate speech.

## 🛡️ CSAM-Focused Safety System

### 1. **Pre-Generation Content Filtering**
- **Keyword Blocking**: Focused list of blocked terms related to:
  - CSAM and age-related inappropriate content (child, teen, minor, etc.) - ZERO TOLERANCE
  - Bestiality and animal-related inappropriate content
  - CSAM-related descriptors and patterns

- **Pattern Detection**: Advanced regex patterns to catch CSAM-related content:
  - Age + inappropriate content combinations
  - School-related inappropriate content
  - Suspicious age references
  - Underage + adult content combinations

### 2. **Style Safety Checks**
- **Style Validation**: Visual styles are checked for CSAM-related descriptors only
- **Description Filtering**: Style descriptions are scanned for CSAM-related terms only
- **Category Validation**: Styles are validated for CSAM content only

### 3. **Reference Image Protection**
- **Description Analysis**: Reference image descriptions are filtered for CSAM content only
- **Content Validation**: Images are checked for CSAM-related descriptors only
- **Upload Monitoring**: Reference image uploads are logged and monitored

### 4. **API-Level Safety**
- **FAL.ai Safety Tolerance**: Set to permissive level to allow explicit content
- **Content Filtering**: Built-in FAL.ai content filtering disabled for adult content
- **Response Validation**: Generated images are validated for CSAM content only

## 🚨 Violation Detection and Logging

### **Real-Time Monitoring**
- **Frontend Logging**: All safety violations are logged in real-time
- **Backend Tracking**: Violations are sent to backend for analysis
- **User Identification**: Wallet addresses are tracked for violations
- **IP Logging**: IP addresses are logged for security analysis

### **Violation Response**
- **Immediate Blocking**: Content is blocked before generation
- **User Education**: Clear error messages with safe alternatives
- **Violation Logging**: All attempts are logged for review
- **Admin Alerts**: Violations trigger admin notifications

## 📊 Monitoring and Analytics

### **What We Track**
- **Violation Attempts**: Number and type of blocked content attempts
- **User Patterns**: Repeated violations from specific wallets
- **Content Categories**: Types of inappropriate content being requested
- **Geographic Data**: IP-based location tracking for violations

### **Response Actions**
- **First Violation**: Warning and education
- **Repeated Violations**: Temporary account restrictions
- **Severe Violations**: Permanent account bans
- **Legal Reporting**: Severe violations reported to authorities

## 🔒 Technical Implementation

### **Frontend Safety**
```javascript
// Content safety check before generation
const safetyCheck = performContentSafetyCheck({
  prompt: customPrompt,
  style: selectedStyle,
  imageDescription: referenceImage
});

if (!safetyCheck.isSafe) {
  // Block generation and log violation
  await logSafetyViolation(safetyCheck, walletAddress);
  throw new Error('Content blocked for safety reasons');
}
```

### **Backend Monitoring**
```javascript
// Safety violation logging endpoint
app.post('/api/safety/violation', async (req, res) => {
  const { walletAddress, violation, userAgent, url } = req.body;
  
  // Log violation with full context
  console.warn('🚨 SAFETY VIOLATION:', {
    timestamp: new Date().toISOString(),
    walletAddress: walletAddress?.toLowerCase(),
    violation: violation,
    userAgent: userAgent,
    url: url,
    ip: req.ip
  });
  
  // Send to monitoring service
  // Alert admin team
  // Flag wallet for review
});
```

## 🚫 Blocked Content Categories - ZERO TOLERANCE

### **CSAM and Age-Related Inappropriate Content**
- Child, children, kid, kids, teen, teenager
- Minor, young, baby, infant, toddler
- School-related inappropriate content
- Underage sexual content
- CSAM-related descriptors (innocent, pure, virgin, naive, vulnerable, little, small)

### **Bestiality and Animal-Related Content**
- Bestiality, animal, beast, zoophilia

## ✅ Allowed Content Categories

### **Explicit Sexual Content** - ALLOWED
- Nude, naked, sexual, pornographic content
- Adult, explicit, erotic material
- Fetish, BDSM, kink-related content

### **Hate Speech and Discrimination** - ALLOWED
- Hate, racist, racism, nazi, fascist
- Supremacist, discrimination, slurs
- Offensive, derogatory content

### **Violence and Harmful Content** - ALLOWED
- Violence, violent, gore, blood, death
- Kill, murder, suicide, self-harm
- Torture, abuse, assault, rape

### **Illegal Activities** - ALLOWED
- Drugs, weapons, explosives
- Terrorism, illegal activities

## 📈 Continuous Improvement

### **Regular Updates**
- **Keyword Lists**: Updated regularly with new threats
- **Pattern Detection**: Enhanced with new suspicious patterns
- **AI Training**: Safety models updated with new data
- **User Feedback**: Safety improvements based on user reports

### **Industry Best Practices**
- **NCMEC Compliance**: Following National Center for Missing & Exploited Children guidelines
- **Platform Standards**: Aligning with major platform safety standards
- **Legal Compliance**: Meeting all applicable laws and regulations
- **Ethical AI**: Following responsible AI development practices

## 🆘 Reporting and Support

### **How to Report**
- **In-App Reporting**: Report button on all generated content
- **Email Support**: safety@yourdomain.com
- **Admin Dashboard**: Real-time violation monitoring
- **Emergency Contact**: 24/7 safety hotline

### **Response Timeline**
- **Immediate**: Content blocking and violation logging
- **Within 1 Hour**: Admin review of violations
- **Within 24 Hours**: User notification and account review
- **Within 48 Hours**: Follow-up actions and improvements

## 🔐 Data Protection

### **Privacy Considerations**
- **Minimal Data Collection**: Only necessary safety data is collected
- **Secure Storage**: All violation data is encrypted and secured
- **Access Control**: Limited access to safety violation data
- **Retention Policy**: Data retained only as long as necessary

### **Legal Compliance**
- **GDPR Compliance**: European data protection regulations
- **CCPA Compliance**: California consumer privacy act
- **COPPA Compliance**: Children's online privacy protection
- **Local Laws**: Compliance with all applicable local laws

## 📞 Emergency Contacts

- **Safety Team**: safety@yourdomain.com
- **Legal Team**: legal@yourdomain.com
- **Emergency Hotline**: +1-800-SAFETY-1
- **Law Enforcement**: Contact local authorities for severe violations

---

**Last Updated**: October 2024
**Version**: 1.0
**Review Cycle**: Quarterly

This safety policy is regularly reviewed and updated to ensure the highest level of protection against CSAM and inappropriate content.
