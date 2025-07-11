# Installment Warnings Enhancement - Reason Column Implementation

## Current Situation Analysis

### Existing Warning System
The current installment warnings system consists of:
- **Backend**: `src/lib/installment-warnings.ts` - Query function for warning data
- **Frontend**: `src/components/Installments/InstallmentWarningsTable.tsx` - Display component
- **SQL Functions**: `rpc_function_supabase_installments.sql` - RPC functions for calculations

### Current Limitations
1. **Query Scope**: Only fetches contracts with `payment_due_date <= today`
2. **Reason Display**: Shows generic "Chậm X kỳ !" for all late contracts
3. **Missing Tomorrow Contracts**: Contracts due tomorrow are not included
4. **No Context**: Users don't know why a contract needs attention or what amount to collect

### Data Sources & Architecture
- **Main View**: `installments_by_store` with customer joins
- **RPC Functions**: 
  - `installment_overdue_stats` - Calculates `late_periods` using FLOOR() logic
  - `installment_next_unpaid_date` - Determines next unpaid date
  - `get_installment_old_debt` - Calculates old debt amounts
- **Calculation Logic**: Complex payment period calculations in InstallmentWarningsTable

## Business Requirements

### New "Reason" Column Requirements
1. **"Hôm nay phải đóng X"** - When payment_due_date equals today
   - X = Amount from first button value (buttonValues[0])
   - Only 1 button typically displayed for today due contracts

2. **"Ngày mai đóng"** - When payment_due_date equals tomorrow  
   - No amount needed, just text
   - No payment buttons displayed for tomorrow contracts

3. **"Chậm X kỳ Y ngày"** - When payment_due_date < today
   - X = Full payment periods late
   - Y = Remaining days after full periods
   - Example: 11 days late with 5-day period = "Chậm 2 kỳ 1 ngày"

4. **"Quá hạn X ngày"** - When contract end date <= today
   - X = Days from contract end to today (inclusive)
   - Contract end = start_date + duration - 1

5. **Mixed Scenarios** - Combine with "và"
   - "Chậm X kỳ Y ngày và Quá hạn Z ngày"

6. **Query Expansion** - Include tomorrow's contracts
   - Change from `payment_due_date <= today` to `payment_due_date <= tomorrow`

### Key Business Logic Clarifications

#### Payment Due Date Boundaries
- **payment_due_date** is always within contract start/end date boundaries
- **Impossible scenario**: payment_due_date = today AND contract overdue (they can't occur together)
- **payment_due_date definition**: Last day of the next payment period that needs to be paid

#### Overdue vs Late Interest
- **Overdue**: Contract completely expired (today >= contract_end_date)
- **Late Interest**: Payment period passed but contract still active (payment_due_date < today)
- **Mixed**: A contract can be both late on payments AND overdue on contract

#### Payment Due Date Management
- **Reference**: `src/components/Installments/tabs/PaymentTabFast.tsx` lines 214-224
- **Logic**: payment_due_date = latest_paid_date + payment_period
- **Contract completion**: When paid to contract end, payment_due_date = null

## Solution Architecture

### Implementation Strategy
1. **Late Period Source**: Use payment_due_date for simplicity (not RPC late_periods)
2. **Amount Display**: Use buttonValues[0] for today due amounts
3. **Date Calculations**: Use payment_due_date for simplification
4. **Tomorrow Contracts**: Display "Ngày mai đóng" without buttons

### Technical Approach
- **Backend**: Modify query scope and add reason calculation function
- **Frontend**: Integrate reason calculation after RPC calls complete
- **Data Flow**: Query → RPC calls → Reason calculation → Display
- **Performance**: Minimal impact using existing data sources

## Step-by-Step Implementation Guide

### Phase 1: Backend Query Enhancement
**File**: `src/lib/installment-warnings.ts`

1. **Expand Query Scope**
   ```typescript
   // Change from:
   .or(`payment_due_date.lte.${today}`)
   
   // To:
   const tomorrow = new Date(today);
   tomorrow.setDate(tomorrow.getDate() + 1);
   const tomorrowStr = tomorrow.toISOString().split('T')[0];
   .or(`payment_due_date.lte.${tomorrowStr}`)
   ```

2. **Add Reason Calculation Function**
   ```typescript
   function calculateInstallmentReason(
     installment: InstallmentWithCustomer,
     buttonValues: number[]
   ): string {
     const today = new Date().toISOString().split('T')[0];
     const tomorrow = new Date();
     tomorrow.setDate(tomorrow.getDate() + 1);
     const tomorrowStr = tomorrow.toISOString().split('T')[0];
     
     // Contract end date calculation
     const contractStart = new Date(installment.start_date);
     const contractEnd = new Date(contractStart);
     contractEnd.setDate(contractEnd.getDate() + installment.duration - 1);
     const contractEndStr = contractEnd.toISOString().split('T')[0];
     
     const paymentDueDate = installment.payment_due_date;
     const paymentPeriod = installment.payment_period || 10;
     
     let reasons: string[] = [];
     
     // 1. Tomorrow due
     if (paymentDueDate === tomorrowStr) {
       reasons.push("Ngày mai đóng");
     }
     
     // 2. Today due  
     else if (paymentDueDate === today) {
       const amount = buttonValues[0] || 0;
       reasons.push(`Hôm nay phải đóng ${formatCurrency(amount)}`);
     }
     
     // 3. Late periods (payment_due_date < today)
     else if (paymentDueDate && paymentDueDate < today) {
       const daysLate = Math.floor(
         (new Date(today).getTime() - new Date(paymentDueDate).getTime()) 
         / (1000 * 60 * 60 * 24)
       );
       const fullPeriods = Math.floor(daysLate / paymentPeriod);
       const remainingDays = daysLate % paymentPeriod;
       
       if (remainingDays > 0) {
         reasons.push(`Chậm ${fullPeriods} kỳ ${remainingDays} ngày`);
       } else if (fullPeriods > 0) {
         reasons.push(`Chậm ${fullPeriods} kỳ`);
       }
     }
     
     // 4. Contract overdue (contract_end < today)
     if (contractEndStr < today) {
       const daysOverdue = Math.floor(
         (new Date(today).getTime() - new Date(contractEndStr).getTime()) 
         / (1000 * 60 * 60 * 24)
       );
       reasons.push(`Quá hạn ${daysOverdue} ngày`);
     }
     
     // 5. Join reasons with "và"
     return reasons.join(' và ') || 'Không xác định';
   }
   ```

### Phase 2: Frontend Integration
**File**: `src/components/Installments/InstallmentWarningsTable.tsx`

1. **Update Interface**
   ```typescript
   interface InstallmentWarning extends InstallmentWithCustomer {
     payments?: InstallmentPaymentPeriod[];
     latestPeriod?: InstallmentPaymentPeriod;
     latePeriods: number;
     totalDueAmount: number;
     buttonValues: number[];
     reason: string; // Add reason field
   }
   ```

2. **Add Reason Calculation in Processing Loop**
   ```typescript
   // In the processing loop after RPC calls
   const reason = calculateInstallmentReason(installment, buttonValues);
   
   warningResults.push({
     ...installment,
     payments: [],
     latePeriods,
     buttonValues,
     totalDueAmount: oldDebtMap.get(installment.id) || 0,
     reason // Add calculated reason
   });
   ```

3. **Add Reason Column to Table**
   ```typescript
   // In table header
   <th className="py-3 px-3 text-center font-medium text-gray-500 text-sm border-r border-gray-200 w-48">
     Lý do
   </th>
   
   // In table row
   <td className="py-3 px-3 border-r border-gray-200 text-center">
     <span className="text-orange-600 font-medium">
       {warning.reason}
     </span>
   </td>
   ```

4. **Replace Current Reason Display**
   ```typescript
   // Remove or update current "Chậm X kỳ !" logic
   // Replace with dynamic reason from calculation
   ```

### Phase 3: Type System Updates
**File**: `src/models/installment.ts`

1. **Update InstallmentWithCustomer Interface**
   ```typescript
   export interface InstallmentWithCustomer {
     // ... existing fields
     reason?: string; // Add optional reason field
   }
   ```

## Important Notes & Warnings

### Calculation Differences
- **payment_due_date calculation**: Simple date arithmetic for late periods
- **RPC late_periods calculation**: Complex logic considering payment history and contract boundaries
- **Potential mismatch**: The simplified payment_due_date approach may not exactly match RPC results
- **Recommendation**: Add note in code about this difference

### Button Logic
- **Today due contracts**: Show payment buttons with amounts
- **Tomorrow due contracts**: No payment buttons (just "Ngày mai đóng")
- **Late contracts**: Show multiple payment buttons for cumulative periods

### Business Logic Constraints
- **payment_due_date boundaries**: Always within contract start/end dates
- **No impossible scenarios**: payment_due_date = today AND contract overdue cannot occur
- **Contract completion**: payment_due_date becomes null when contract is fully paid

### Performance Considerations
- **Query expansion**: Adding tomorrow contracts increases result set slightly
- **Reason calculation**: Client-side calculation using existing RPC data
- **Minimal impact**: Uses existing data sources and calculation patterns

## Testing Scenarios

### Test Cases to Validate
1. **Tomorrow due**: Contract with payment_due_date = tomorrow
2. **Today due**: Contract with payment_due_date = today (verify amount display)
3. **Late periods**: Various scenarios with different payment periods
4. **Contract overdue**: Contracts past their end date
5. **Mixed scenarios**: Late + overdue combinations
6. **Edge cases**: Zero payment periods, missing dates, etc.

### Expected Outcomes
- **Enhanced contextual information**: Staff understand why contracts need attention
- **Improved prioritization**: Clear indication of urgency and required actions
- **Better user experience**: Actionable information instead of generic messages
- **Maintained performance**: No significant impact on query or rendering speed

## Future Considerations

### Potential Enhancements
1. **Color coding**: Different colors for different reason types
2. **Sorting**: Sort by reason priority (today → tomorrow → late → overdue)
3. **Filtering**: Filter by reason type
4. **Notifications**: Alert for high-priority reasons

### Monitoring
- **Query performance**: Monitor impact of expanded query scope
- **Calculation accuracy**: Compare simplified vs RPC calculations
- **User feedback**: Gather feedback on reason clarity and usefulness

This document provides complete context for implementing the enhanced installment warnings system with contextual reason information.