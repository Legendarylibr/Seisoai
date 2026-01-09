// Application monitoring utility

interface Metrics {
  requests: number;
  errors: number;
  walletConnections: number;
  payments: number;
  generations: number;
  startTime: number;
}

interface PerformanceEntry {
  type: string;
  endpoint?: string;
  duration?: number;
  success: boolean;
  timestamp: number;
}

interface MetricsResult extends Metrics {
  uptime: number;
  errorRate: number;
  avgRequestDuration: number;
}

interface PerformanceSummary {
  requestsLastHour: number;
  errorsLastHour: number;
  slowRequestsLastHour: number;
  errorRateLastHour: number;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'starting';
  issues: string[];
  metrics: MetricsResult;
  performance: PerformanceSummary;
  timestamp: string;
}

class AppMonitor {
  private metrics: Metrics;
  private performanceEntries: PerformanceEntry[];

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
  trackRequest(endpoint: string, duration: number, success: boolean = true): void {
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
  trackWalletConnection(walletType: string, success: boolean = true): void {
    if (success) this.metrics.walletConnections++;
    if (!success) this.metrics.errors++;
  }

  // Track payment
  trackPayment(amount: number, chain: string, success: boolean = true): void {
    if (success) this.metrics.payments++;
    if (!success) this.metrics.errors++;
  }

  // Track generation
  trackGeneration(type: string, success: boolean = true): void {
    if (success) this.metrics.generations++;
    if (!success) this.metrics.errors++;
  }

  // Get metrics
  getMetrics(): MetricsResult {
    const uptime = Date.now() - this.metrics.startTime;
    return {
      ...this.metrics,
      uptime,
      errorRate: this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests) * 100 : 0,
      avgRequestDuration: this.getAverageRequestDuration()
    };
  }

  // Get average request duration
  private getAverageRequestDuration(): number {
    const requests = this.performanceEntries.filter(entry => entry.type === 'request');
    if (requests.length === 0) return 0;
    
    const totalDuration = requests.reduce((sum, req) => sum + (req.duration || 0), 0);
    return totalDuration / requests.length;
  }

  // Get performance summary
  getPerformanceSummary(): PerformanceSummary {
    const now = Date.now();
    const lastHour = this.performanceEntries.filter(entry => 
      now - entry.timestamp < 60 * 60 * 1000
    );
    
    const errors = lastHour.filter(entry => !entry.success);
    const slowRequests = lastHour.filter(entry => 
      entry.type === 'request' && (entry.duration || 0) > 5000
    );

    return {
      requestsLastHour: lastHour.length,
      errorsLastHour: errors.length,
      slowRequestsLastHour: slowRequests.length,
      errorRateLastHour: lastHour.length > 0 ? (errors.length / lastHour.length) * 100 : 0
    };
  }

  // Health check
  getHealthStatus(): HealthStatus {
    const metrics = this.getMetrics();
    const performance = this.getPerformanceSummary();
    
    let status: 'healthy' | 'degraded' | 'starting' = 'healthy';
    const issues: string[] = [];

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
  reset(): void {
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





