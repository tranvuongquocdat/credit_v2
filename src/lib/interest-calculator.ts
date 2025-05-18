import { Credit, InterestType } from '@/models/credit';

export interface InterestConfig {
  interestType: string; // 'daily', 'monthly_30', 'monthly_custom', 'weekly_percent', 'weekly_k'
  interestValue: number;
  interestNotation: string; // 'k_per_million', 'k_per_day', 'percent_per_month', etc.
  loanAmount: number; // Only needed for k-based calculations
}

/**
 * Convert any interest rate to a standardized daily percentage rate (decimal)
 * This creates a common basis for calculations regardless of how the user entered the rate
 */
export function normalizeToStandardRate(config: InterestConfig): number {
  const { interestType, interestValue, interestNotation, loanAmount } = config;
  
  // For daily interest
  if (interestType === 'daily') {
    if (interestNotation === 'k_per_million') {
      // Convert k/million to a daily percentage rate
      // Example: 5k per million per day = 0.5% per day
      return (interestValue * 1000) / (1000000); // result is daily decimal (0.005)
    } else if (interestNotation === 'k_per_day') {
      // Convert fixed k per day to a daily percentage rate
      return (interestValue * 1000) / loanAmount;
    }
  }
  
  // For monthly interest
  else if (interestType === 'monthly_30' || interestType === 'monthly_custom') {
    // Convert monthly percentage to daily percentage
    // Example: 3% per month = 0.1% per day
    return interestValue / 100 / 30; // result is daily decimal (0.001)
  }
  
  // For weekly percentage
  else if (interestType === 'weekly_percent') {
    // Convert weekly percentage to daily percentage
    // Example: 2% per week = 0.285% per day
    return interestValue / 100 / 7; // result is daily decimal (0.00285)
  }
  
  // For weekly fixed amount
  else if (interestType === 'weekly_k') {
    // Convert fixed k per week to a daily percentage rate
    // Example: 100k per week on 10M loan = 1% per week = 0.143% per day
    return (interestValue * 1000) / loanAmount / 7; // result is daily decimal
  }
  
  return 0;
}

/**
 * Calculate the daily rate for a credit object using its stored configuration
 */
export function calculateDailyRateForCredit(credit: Credit): number {
  // For legacy records that might not have these fields
  const interestUiType = credit.interest_ui_type || 'daily';
  const interestNotation = credit.interest_notation || 
    (credit.interest_type === InterestType.PERCENTAGE ? 'percent_per_month' : 'k_per_million');
  
  return normalizeToStandardRate({
    interestType: interestUiType,
    interestValue: credit.interest_value,
    interestNotation: interestNotation,
    loanAmount: credit.loan_amount
  });
}

/**
 * Calculate interest amount for a specific period in days
 * @param credit - The credit object containing loan and interest information
 * @param days - Number of days to calculate interest for
 * @returns The calculated interest amount for the specified period
 */
export function calculateInterestAmount(credit: Credit, days: number): number {
  const dailyRate = calculateDailyRateForCredit(credit);
  return Math.round(credit.loan_amount * dailyRate * days);
}

/**
 * Calculate interest for a date range
 */
export function calculateInterestForDateRange(
  credit: Credit,
  startDate: Date,
  endDate: Date
): number {
  // Calculate days between dates (inclusive)
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return calculateInterestAmount(credit, daysDiff);
}

/**
 * Format interest rate for display based on the stored configuration
 */
export function getInterestDisplayString(credit: Credit): string {
  const { interest_value, interest_type } = credit;
  const interestUiType = credit.interest_ui_type || 'daily';
  const interestNotation = credit.interest_notation || 
    (interest_type === InterestType.PERCENTAGE ? 'percent_per_month' : 'k_per_million');
  
  // Different formatting based on the stored configuration
  if (interestUiType === 'daily') {
    if (interestNotation === 'k_per_million') {
      return `${interest_value}k/triệu/ngày`;
    } else if (interestNotation === 'k_per_day') {
      return `${interest_value}k/ngày`;
    }
  }
  else if (interestUiType === 'monthly_30' || interestUiType === 'monthly_custom') {
    return `${interest_value}%/tháng`;
  }
  else if (interestUiType === 'weekly_percent') {
    return `${interest_value}%/tuần`;
  }
  else if (interestUiType === 'weekly_k') {
    return `${interest_value}k/tuần`;
  }
  
  // Fallback for legacy records
  return `${interest_value}${interest_type === InterestType.PERCENTAGE ? '%' : 'k'}`;
}

/**
 * Get the loan period label based on interest type (days/weeks/months)
 */
export function getLoanPeriodLabel(credit: Credit): string {
  const interestUiType = credit.interest_ui_type || 'daily';
  
  if (interestUiType.includes('weekly')) {
    return 'Số tuần vay';
  } else if (interestUiType.includes('monthly')) {
    return 'Số tháng vay';
  } else {
    return 'Số ngày vay';
  }
}

/**
 * Convert from standardized rate back to user-selected format for editing
 */
export function convertFromStandardRate(
  dailyRate: number,
  interestType: string,
  interestNotation: string,
  loanAmount: number
): number {
  if (interestType === 'daily') {
    if (interestNotation === 'k_per_million') {
      return Math.round(dailyRate * 1000000 / 1000);
    } else if (interestNotation === 'k_per_day') {
      return Math.round(dailyRate * loanAmount / 1000);
    }
  }
  
  else if (interestType === 'monthly_30' || interestType === 'monthly_custom') {
    return Math.round(dailyRate * 30 * 100 * 100) / 100; // Round to 2 decimal places
  }
  
  else if (interestType === 'weekly_percent') {
    return Math.round(dailyRate * 7 * 100 * 100) / 100; // Round to 2 decimal places
  }
  
  else if (interestType === 'weekly_k') {
    return Math.round(dailyRate * loanAmount * 7 / 1000);
  }
  
  return 0;
}
