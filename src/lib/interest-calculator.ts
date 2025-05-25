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
      return `${interest_value}k/triệu`;
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

/**
 * Calculate interest with consideration for principal changes within the period
 * Used when there are principal repayments or additional loans during a payment period
 * 
 * @param credit - The credit object containing basic loan information
 * @param startDate - Start date of the payment period
 * @param endDate - End date of the payment period
 * @param principalChanges - Array of principal changes with dates and amounts
 * @returns The calculated interest amount for the specified period
 */
export interface PrincipalChange {
  date: string; // ISO string date of the change
  previousAmount: number; // Loan amount before the change
  newAmount: number; // Loan amount after the change
  changeType: 'additional_loan' | 'principal_repayment';
}

export function calculateInterestWithPrincipalChanges(
  credit: Credit,
  startDate: Date,
  endDate: Date,
  principalChanges: PrincipalChange[]
): number {
  // If no principal changes, use the standard calculation
  if (!principalChanges || principalChanges.length === 0) {
    return calculateInterestForDateRange(credit, startDate, endDate);
  }

  // Sort all changes by date (including those outside our period)
  const sortedChanges = [...principalChanges].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Filter changes that fall within the payment period
  const relevantChanges = sortedChanges.filter(change => {
    const changeDate = new Date(change.date);
    return (
      changeDate >= startDate && 
      changeDate <= endDate
    );
  });

  // Find the original loan amount by working backwards through changes
  // First, assume it's the current loan amount in the credit object
  let originalLoanAmount = credit.loan_amount;
  
  // Find the very first change in the full history to determine the original amount
  if (sortedChanges.length > 0) {
    const firstEverChange = sortedChanges[0];
    originalLoanAmount = firstEverChange.previousAmount;
  }
  
  console.log(`[Interest Calc] Original loan amount from history: ${originalLoanAmount}`);
  
  // Now determine the correct starting amount for this specific period
  let initialLoanAmount = originalLoanAmount;
  
  // If there are changes before the start date, use the latest previous change
  const previousChanges = sortedChanges.filter(change => 
    new Date(change.date) < startDate
  );
  
  if (previousChanges.length > 0) {
    // Use the loan amount after the latest previous change
    const latestPreviousChange = previousChanges[previousChanges.length - 1];
    initialLoanAmount = latestPreviousChange.newAmount;
    console.log(`[Interest Calc] Using loan amount after previous change: ${initialLoanAmount}`);
  }

  // If no relevant changes in this period, just use the starting amount for the entire period
  if (relevantChanges.length === 0) {
    console.log(`[Interest Calc] No changes in this period, using initial amount: ${initialLoanAmount}`);
    // Create a credit object with the initial loan amount for this period
    const periodCredit = { ...credit, loan_amount: initialLoanAmount };
    return calculateInterestForDateRange(periodCredit, startDate, endDate);
  }

  // Calculate interest in segments
  let totalInterest = 0;
  let currentDate = new Date(startDate);
  let currentPrincipal = initialLoanAmount; // Start with the correct initial loan amount

  // For logging and debugging
  console.log(`[Interest Calc] Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`[Interest Calc] Initial loan amount for this period: ${initialLoanAmount}`);
  console.log(`[Interest Calc] Credit object loan amount: ${credit.loan_amount}`);
  console.log(`[Interest Calc] Relevant changes in period: ${relevantChanges.length}`);

  // Process each change chronologically
  for (const change of relevantChanges) {
    const changeDate = new Date(change.date);
    
    // Calculate interest for the segment before this change
    if (changeDate > currentDate) {
      // Calculate number of days in this segment (end date not inclusive)
      const segmentDays = Math.floor((changeDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (segmentDays > 0) {
        // Create a credit object with the current principal
        const segmentCredit = { ...credit, loan_amount: currentPrincipal };
        
        // Calculate interest for this segment
        const segmentInterest = calculateInterestAmount(segmentCredit, segmentDays);
        
        // Log for debugging
        console.log(`[Interest Calc] Segment: ${currentDate.toISOString()} to ${new Date(changeDate.getTime() - 86400000).toISOString()}`);
        console.log(`[Interest Calc] Days: ${segmentDays}, Principal: ${currentPrincipal}, Interest: ${segmentInterest}`);
        
        totalInterest += segmentInterest;
      }
    }
    
    // Update current values for next segment
    currentDate = changeDate;
    currentPrincipal = change.newAmount; // Use the new amount from this change
    console.log(`[Interest Calc] Principal changed to: ${currentPrincipal} on ${changeDate.toISOString()}`);
  }
  
  // Calculate interest for the final segment (after the last change to the end date)
  // Adding 1 to include the end date in the calculation
  const finalDays = Math.floor((endDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  if (finalDays > 0) {
    // Create a credit object with the final principal
    const finalCredit = { ...credit, loan_amount: currentPrincipal };
    
    // Calculate interest for the final segment
    const finalInterest = calculateInterestAmount(finalCredit, finalDays);
    
    // Log for debugging
    console.log(`[Interest Calc] Final segment: ${currentDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`[Interest Calc] Days: ${finalDays}, Principal: ${currentPrincipal}, Interest: ${finalInterest}`);
    
    totalInterest += finalInterest;
  }
  
  console.log(`[Interest Calc] Total interest: ${totalInterest}`);
  return Math.round(totalInterest);
}
