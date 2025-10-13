import React, { useState } from 'react';

const LegalDisclaimer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Tab Buttons */}
      <div className="flex gap-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-red-600/90 hover:bg-red-600 text-white text-xs rounded-t-lg border border-red-500/50 transition-all duration-200 hover:scale-105"
        >
          <span>⚠️</span>
          <span>Legal</span>
          <span>{isOpen ? '▼' : '▲'}</span>
        </button>
        <button
          onClick={() => setShowTerms(!showTerms)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600/90 hover:bg-blue-600 text-white text-xs rounded-t-lg border border-blue-500/50 transition-all duration-200 hover:scale-105"
        >
          <span>📋</span>
          <span>Terms</span>
          <span>{showTerms ? '▼' : '▲'}</span>
        </button>
      </div>

      {/* Disclaimer Panel */}
      {isOpen && (
        <div className="bg-black/95 backdrop-blur-sm border border-red-500/30 rounded-lg shadow-2xl max-w-md w-80 max-h-96 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-red-400">Legal Disclaimer</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors ml-auto"
              >
                ✕
              </button>
            </div>
            
            <div className="text-xs text-gray-300 leading-relaxed">
              <p className="mb-3">
                <strong className="text-red-400">By using this service, you agree to:</strong>
              </p>
              <div className="space-y-1 mb-3 text-xs">
                <p>• <strong>ZERO LIABILITY:</strong> We waive all liability for any generated content</p>
                <p>• <strong>USER RESPONSIBILITY:</strong> You are solely responsible for all content you create</p>
                <p>• <strong>NO WARRANTIES:</strong> Service provided "AS IS" without any guarantees</p>
                <p>• <strong>LEGAL COMPLIANCE:</strong> You must comply with all applicable laws</p>
                <p>• <strong>ZERO TOLERANCE:</strong> Absolutely zero tolerance for sexually explicit content</p>
                <p>• <strong>CSAM PROHIBITED:</strong> Zero tolerance for child sexual abuse material</p>
                <p>• <strong>CONTENT FILTERING:</strong> We may block inappropriate content</p>
                <p>• <strong>INDEMNIFICATION:</strong> You agree to hold us harmless from any claims</p>
                <p>• <strong>TERMINATION:</strong> We may terminate access for violations</p>
              </div>
              <div className="bg-red-900/20 border border-red-500/30 rounded p-2 mb-3">
                <p className="text-xs text-red-300 font-semibold">
                  ⚠️ WARNING: This service has zero tolerance for sexually explicit content. All content must comply with our content policies.
                </p>
              </div>
              <div className="text-center">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                >
                  I Understand & Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terms of Service Panel */}
      {showTerms && (
        <div className="bg-black/95 backdrop-blur-sm border border-blue-500/30 rounded-lg shadow-2xl max-w-lg w-96 max-h-96 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-blue-400">Terms of Service</h3>
              <button
                onClick={() => setShowTerms(false)}
                className="text-gray-400 hover:text-white transition-colors ml-auto"
              >
                ✕
              </button>
            </div>
            
            <div className="text-xs text-gray-300 leading-relaxed space-y-3">
              <div>
                <h4 className="font-semibold text-blue-300 mb-1">1. Service Description</h4>
                <p>This AI image generation service creates images based on user prompts and reference images. The service is provided "AS IS" without any warranties.</p>
              </div>

              <div>
                <h4 className="font-semibold text-blue-300 mb-1">2. Content Policy</h4>
                <ul className="ml-4 space-y-1">
                  <li>• <strong>ZERO TOLERANCE</strong> for sexually explicit content</li>
                  <li>• <strong>ZERO TOLERANCE</strong> for CSAM (Child Sexual Abuse Material)</li>
                  <li>• Content filtering may block inappropriate material</li>
                  <li>• We reserve the right to terminate access for violations</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-blue-300 mb-1">3. User Responsibilities</h4>
                <ul className="ml-4 space-y-1">
                  <li>• You are solely responsible for all content you generate</li>
                  <li>• You must comply with all applicable laws and regulations</li>
                  <li>• You agree to indemnify us against any claims</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-blue-300 mb-1">4. Liability & Disclaimers</h4>
                <ul className="ml-4 space-y-1">
                  <li>• We waive all liability for generated content</li>
                  <li>• No warranties on service quality or availability</li>
                  <li>• Service may be interrupted or discontinued</li>
                  <li>• Third-party services are not our responsibility</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-blue-300 mb-1">5. Payment & Credits</h4>
                <ul className="ml-4 space-y-1">
                  <li>• Credits are non-refundable</li>
                  <li>• Prices may change without notice</li>
                  <li>• Payment processing handled by third parties</li>
                  <li>• NFT holder discounts subject to verification</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-blue-300 mb-1">6. Privacy & Data</h4>
                <ul className="ml-4 space-y-1">
                  <li>• <strong>User prompts are NOT stored</strong> - your text inputs are not saved</li>
                  <li>• <strong>Generated images are automatically deleted after 30 days</strong></li>
                  <li>• We may log safety violations for security purposes</li>
                  <li>• Wallet addresses are tracked for payment and security</li>
                  <li>• Minimal data collection - only what's necessary for service operation</li>
                  <li>• No personal information is shared with third parties</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-blue-300 mb-1">7. Termination</h4>
                <p>We may terminate your access immediately for violations of these terms, illegal activity, or at our discretion.</p>
              </div>

              <div>
                <h4 className="font-semibold text-blue-300 mb-1">8. Changes to Terms</h4>
                <p>We reserve the right to modify these terms at any time. Continued use constitutes acceptance of modified terms.</p>
              </div>

              <div className="text-center pt-2 border-t border-gray-600">
                <button
                  onClick={() => setShowTerms(false)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                >
                  Close Terms
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LegalDisclaimer;