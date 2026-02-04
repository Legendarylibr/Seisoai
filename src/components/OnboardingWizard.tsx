/**
 * OnboardingWizard Component
 * Multi-step tutorial for new users with progressive rewards
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft, Gift, Sparkles, Image, Film, Music, Share2, Check } from 'lucide-react';
import { BTN, PANEL, WIN95, hoverHandlers, WINDOW_TITLE_STYLE } from '../utils/buttonStyles';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  credits?: number;
  action?: string;
  completed?: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to SeisoAI!',
    description: 'Create stunning AI images, videos, and music with just a few clicks. Let\'s show you around!',
    icon: <Sparkles className="w-8 h-8" />,
    credits: 0
  },
  {
    id: 'images',
    title: 'Generate Images',
    description: 'Choose from 20+ style presets or write your own prompt. Try styles like Anime, Cyberpunk, or Studio Ghibli!',
    icon: <Image className="w-8 h-8" />,
    credits: 0,
    action: 'Try Image Generation'
  },
  {
    id: 'videos',
    title: 'Create Videos',
    description: 'Transform static images into stunning 4-8 second AI videos. Perfect for social media content!',
    icon: <Film className="w-8 h-8" />,
    credits: 0,
    action: 'Explore Video Generation'
  },
  {
    id: 'music',
    title: 'Generate Music',
    description: 'Create original AI music in 50+ genres. From EDM to Jazz, generate professional-quality tracks in seconds.',
    icon: <Music className="w-8 h-8" />,
    credits: 0,
    action: 'Try Music Generation'
  },
  {
    id: 'share',
    title: 'Share & Earn',
    description: 'Share your creations on social media and earn 1 credit per share (up to 5 per week). Invite friends and earn 5 credits for each signup!',
    icon: <Share2 className="w-8 h-8" />,
    credits: 0
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'You\'ve completed the tour and earned bonus credits. Start creating amazing content!',
    icon: <Gift className="w-8 h-8" />,
    credits: 5,
    action: 'Start Creating'
  }
];

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ isOpen, onClose, onComplete }) => {
  const { isAuthenticated, userId, refreshCredits } = useEmailAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isCompleting, setIsCompleting] = useState(false);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);

  // Check if user has already completed onboarding
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      // Check localStorage for onboarding status
      const completed = localStorage.getItem('onboarding_completed');
      if (completed === 'true') {
        onClose();
      }
    }
  }, [isOpen, isAuthenticated, onClose]);

  // Navigate to next step
  const nextStep = useCallback(() => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      const step = ONBOARDING_STEPS[currentStep];
      setCompletedSteps(prev => new Set([...prev, step.id]));
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep]);

  // Navigate to previous step
  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  // Complete onboarding and award credits
  const completeOnboarding = useCallback(async () => {
    if (isCompleting) return;
    
    setIsCompleting(true);
    
    try {
      // Award completion credits via API
      if (isAuthenticated && userId) {
        const csrfToken = await ensureCSRFToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
        
        const token = localStorage.getItem('authToken');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(`${API_URL}/api/user/complete-onboarding`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ userId })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.creditsAwarded) {
            setTotalCreditsEarned(data.creditsAwarded);
          }
          
          // Refresh credits
          if (refreshCredits) {
            await refreshCredits();
          }
        }
      }
      
      // Mark as completed in localStorage
      localStorage.setItem('onboarding_completed', 'true');
      
      // Wait a moment to show the completion screen
      setTimeout(() => {
        onComplete?.();
        onClose();
      }, 2000);
      
    } catch (error) {
      logger.error('Failed to complete onboarding', { error: (error as Error).message });
    } finally {
      setIsCompleting(false);
    }
  }, [isAuthenticated, userId, refreshCredits, onComplete, onClose, isCompleting]);

  // Handle step action click
  const handleAction = useCallback(() => {
    const step = ONBOARDING_STEPS[currentStep];
    
    if (step.id === 'complete') {
      completeOnboarding();
    } else {
      nextStep();
    }
  }, [currentStep, nextStep, completeOnboarding]);

  // Skip onboarding
  const handleSkip = useCallback(() => {
    localStorage.setItem('onboarding_completed', 'true');
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div 
        className="w-full max-w-md overflow-hidden"
        style={PANEL.window}
      >
        {/* Title Bar */}
        <div 
          className="flex items-center justify-between px-2 py-1"
          style={WINDOW_TITLE_STYLE}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-bold">Getting Started</span>
          </div>
          <button
            onClick={handleSkip}
            className="w-5 h-5 flex items-center justify-center text-xs"
            style={BTN.small}
            {...hoverHandlers}
            title="Skip tour"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1" style={{ background: WIN95.border.dark }}>
          <div 
            className="h-full transition-all duration-300"
            style={{ width: `${progress}%`, background: WIN95.highlight }}
          />
        </div>

        {/* Content */}
        <div className="p-6" style={{ background: WIN95.bg }}>
          {/* Step Icon */}
          <div className="flex justify-center mb-4">
            <div 
              className="w-16 h-16 flex items-center justify-center rounded"
              style={{ 
                background: WIN95.highlight,
                color: WIN95.highlightText
              }}
            >
              {step.icon}
            </div>
          </div>

          {/* Step Content */}
          <div className="text-center mb-6">
            <h2 
              className="text-lg font-bold mb-2"
              style={{ color: WIN95.text }}
            >
              {step.title}
            </h2>
            <p 
              className="text-sm"
              style={{ color: WIN95.text }}
            >
              {step.description}
            </p>
            
            {/* Credits badge */}
            {step.credits && step.credits > 0 && (
              <div 
                className="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded text-sm font-bold"
                style={{ 
                  background: '#dcfce7',
                  color: '#166534',
                  border: '1px solid #86efac'
                }}
              >
                <Gift className="w-4 h-4" />
                +{step.credits} Bonus Credits!
              </div>
            )}
          </div>

          {/* Step Indicators */}
          <div className="flex justify-center gap-2 mb-6">
            {ONBOARDING_STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentStep(i)}
                className="w-2 h-2 rounded-full transition-all"
                style={{
                  background: i === currentStep 
                    ? WIN95.highlight 
                    : completedSteps.has(s.id) 
                      ? WIN95.successText 
                      : WIN95.border.dark
                }}
              />
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2 text-sm"
                style={BTN.base}
                {...hoverHandlers}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
            
            <button
              onClick={handleAction}
              disabled={isCompleting}
              className="flex-1 flex items-center justify-center gap-1 px-4 py-2 text-sm"
              style={isCompleting ? BTN.disabled : {
                background: 'linear-gradient(180deg, #1084d0 0%, #000080 100%)',
                color: '#ffffff',
                border: 'none',
                boxShadow: 'inset 1px 1px 0 #4090e0, inset -1px -1px 0 #000040',
                cursor: 'pointer'
              }}
            >
              {isCompleting ? (
                <>Processing...</>
              ) : isLastStep ? (
                <>
                  <Check className="w-4 h-4" />
                  {step.action || 'Complete'}
                </>
              ) : (
                <>
                  {step.action || 'Next'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Skip link */}
          {!isLastStep && (
            <button
              onClick={handleSkip}
              className="w-full mt-3 text-xs text-center"
              style={{ color: WIN95.textDisabled }}
            >
              Skip tour
            </button>
          )}
        </div>

        {/* Completion Message */}
        {isCompleting && totalCreditsEarned > 0 && (
          <div 
            className="p-4 text-center"
            style={{ 
              background: WIN95.highlight,
              color: WIN95.highlightText
            }}
          >
            <Gift className="w-6 h-6 mx-auto mb-2" />
            <p className="font-bold">You earned {totalCreditsEarned} bonus credits!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;
