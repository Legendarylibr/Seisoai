// Application monitoring utility
class AppMonitor {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      walletConnections: 0,
      payments: 0,
      generations: 0,
      startTime: Date.now()
    };
    this.performanceEntries = [];
  }

  // Track request
  trackRequest(endpoint, duration, success = true) {
    this.metrics.requests++;
    if (!success) this.metrics.errors++;
    
    this.performanceEntries.push({
      type: 'request',
      endpoint,
      duration,
      success,
      timestamp: Date.now()
    });

    // Keep only last 1000 entries
    if (this.performanceEntries.length > 1000) {
      this.performanceEntries = this.performanceEntries.slice(-1000);
    }
  }

  // Track wallet connection
  trackWalletConnection(walletType, success = true) {
    if (success) this.metrics.walletConnections++;
    if (!success) this.metrics.errors++;
  }

  // Track payment
  trackPayment(amount, chain, success = true) {
    if (success) this.metrics.payments++;
    if (!success) this.metrics.errors++;
  }

  // Track generation
  trackGeneration(type, success = true) {
    if (success) this.metrics.generations++;
    if (!success) this.metrics.errors++;
  }

  // Get metrics
  getMetrics() {
    const uptime = Date.now() - this.metrics.startTime;
    return {
      ...this.metrics,
      uptime,
      errorRate: this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests) * 100 : 0,
      avgRequestDuration: this.getAverageRequestDuration()
    };
  }

  // Get average request duration
  getAverageRequestDuration() {
    const requests = this.performanceEntries.filter(entry => entry.type === 'request');
    if (requests.length === 0) return 0;
    
    const totalDuration = requests.reduce((sum, req) => sum + req.duration, 0);
    return totalDuration / requests.length;
  }

  // Get performance summary
  getPerformanceSummary() {
    const now = Date.now();
    const lastHour = this.performanceEntries.filter(entry => 
      now - entry.timestamp < 60 * 60 * 1000
    );
    
    const errors = lastHour.filter(entry => !entry.success);
    const slowRequests = lastHour.filter(entry => 
      entry.type === 'request' && entry.duration > 5000
    );

    return {
      requestsLastHour: lastHour.length,
      errorsLastHour: errors.length,
      slowRequestsLastHour: slowRequests.length,
      errorRateLastHour: lastHour.length > 0 ? (errors.length / lastHour.length) * 100 : 0
    };
  }

  // Health check
  getHealthStatus() {
    const metrics = this.getMetrics();
    const performance = this.getPerformanceSummary();
    
    let status = 'healthy';
    let issues = [];

    // Check error rate
    if (metrics.errorRate > 10) {
      status = 'degraded';
      issues.push(`High error rate: ${metrics.errorRate.toFixed(2)}%`);
    }

    // Check slow requests
    if (performance.slowRequestsLastHour > 10) {
      status = 'degraded';
      issues.push(`Too many slow requests: ${performance.slowRequestsLastHour}`);
    }

    // Check uptime
    if (metrics.uptime < 60000) { // Less than 1 minute
      status = 'starting';
    }

    return {
      status,
      issues,
      metrics,
      performance,
      timestamp: new Date().toISOString()
    };
  }

  // Reset metrics
  reset() {
    this.metrics = {
      requests: 0,
      errors: 0,
      walletConnections: 0,
      payments: 0,
      generations: 0,
      startTime: Date.now()
    };
    this.performanceEntries = [];
  }
}

// Create singleton instance
const appMonitor = new AppMonitor();

export default appMonitor;
