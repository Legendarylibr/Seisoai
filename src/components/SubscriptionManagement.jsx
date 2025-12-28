import React, { useState, useEffect } from 'react';
import { X, CreditCard, Calendar, DollarSign, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import logger from '../utils/logger.js';
import { API_URL } from '../utils/apiConfig.js';

const SubscriptionManagement = ({ isOpen, onClose }) => {
  const { email, refreshCredits } = useEmailAuth();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (isOpen && email) {
      fetchSubscription();
    }
  }, [isOpen, email]);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('authToken');
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/api/stripe/subscription`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setSubscription(data.subscription);
      } else {
        setSubscription(null);
        if (data.error && !data.error.includes('No active subscription')) {
          setError(data.error);
        }
      }
    } catch (err) {
      logger.error('Error fetching subscription:', { error: err.message });
      setError('Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  const openBillingPortal = async () => {
    try {
      setOpeningPortal(true);
      setError(null);
      setSuccess(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/api/stripe/billing-portal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && data.success && data.url) {
        // Redirect to Stripe billing portal
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to open billing portal');
      }
    } catch (err) {
      logger.error('Error opening billing portal:', { error: err.message });
      setError('Failed to open billing portal');
    } finally {
      setOpeningPortal(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatAmount = (amount) => {
    return `$${(amount / 100).toFixed(2)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto relative animate-slide-up">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <CreditCard className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Subscription Management</h2>
          </div>
          <p className="text-gray-400 text-sm">Manage your subscription and billing</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-300 text-sm">{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-green-300 text-sm">{success}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        )}

        {/* No Subscription */}
        {!loading && !subscription && (
          <div className="text-center py-12">
            <div className="mb-4">
              <CreditCard className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Active Subscription</h3>
            <p className="text-gray-400 mb-6">
              You don't have an active subscription. Visit the Pricing page to subscribe.
            </p>
            <button
              onClick={onClose}
              className="btn-primary px-6 py-3"
            >
              Close
            </button>
          </div>
        )}

        {/* Active Subscription */}
        {!loading && subscription && (
          <div className="space-y-4">
            {/* Subscription Status */}
            <div className="p-4 bg-gradient-to-r from-teal-500/10 to-blue-500/10 rounded-lg border border-teal-500/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    subscription.status === 'active' ? 'bg-green-400' :
                    subscription.status === 'canceled' ? 'bg-red-400' :
                    'bg-yellow-400'
                  }`}></div>
                  <span className="text-sm font-semibold text-white capitalize">
                    {subscription.status === 'active' ? 'Active' :
                     subscription.status === 'canceled' ? 'Canceled' :
                     subscription.status}
                  </span>
                </div>
                {subscription.cancel_at_period_end && (
                  <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">
                    Cancels at period end
                  </span>
                )}
              </div>

              {/* Plan Details */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Plan</span>
                  <span className="text-sm font-semibold text-white">
                    {subscription.items?.data[0]?.price?.nickname || 
                     formatAmount(subscription.items?.data[0]?.price?.unit_amount || 0) + '/month'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Amount</span>
                  <span className="text-sm font-semibold text-white">
                    {formatAmount(subscription.items?.data[0]?.price?.unit_amount || 0)}/month
                  </span>
                </div>
              </div>
            </div>

            {/* Billing Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-gray-400">Current Period Start</span>
                </div>
                <p className="text-sm font-semibold text-white">
                  {formatDate(subscription.current_period_start)}
                </p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-gray-400">Current Period End</span>
                </div>
                <p className="text-sm font-semibold text-white">
                  {formatDate(subscription.current_period_end)}
                </p>
              </div>
            </div>

            {/* Manage Subscription Button */}
            {subscription.status === 'active' && (
              <div className="pt-4 border-t border-white/10">
                <button
                  onClick={openBillingPortal}
                  disabled={openingPortal}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-300 font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {openingPortal ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Opening...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Manage Subscription in Stripe</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-400 text-center mt-2">
                  Open Stripe's billing portal to cancel, update payment method, or view invoices
                </p>
              </div>
            )}

            {/* Already Canceled */}
            {subscription.cancel_at_period_end && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-sm text-yellow-300 text-center">
                  Your subscription will cancel on {formatDate(subscription.current_period_end)}. 
                  You will continue to have access until then.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionManagement;

