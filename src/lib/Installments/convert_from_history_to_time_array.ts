const mockData = [
    {
        created_at: '2024-01-01T00:00:00Z',
        credit_id: 'credit-uuid-1',
        transaction_type: 'initial_loan',
        debit_amount: 0,
        credit_amount: 1000000,
        description: 'Initial loan amount',
        effective_date: '2024-01-04',
        date_status: 'only'
    },
    {
        created_at: '2024-01-05T00:00:00Z',
        credit_id: 'credit-uuid-1',
        transaction_type: 'payment',
        debit_amount: 50000,
        credit_amount: 0,
        description: 'Payment for period start',
        effective_date: '2024-01-05',
        date_status: 'start'
    },
    {
        created_at: '2024-01-06T00:00:00Z',
        credit_id: 'credit-uuid-1',
        transaction_type: 'payment',
        debit_amount: 0,
        credit_amount: 0,
        description: 'No payment on this day',
        effective_date: '2024-01-06',
        date_status: 'end'
    },
    {
        created_at: '2024-01-07T00:00:00Z',
        credit_id: 'credit-uuid-1',
        transaction_type: 'payment',
        debit_amount: 0,
        credit_amount: 0,
        description: 'No payment on this day',
        effective_date: '2024-01-07',
        date_status: 'only'
    },
    {
        created_at: '2024-01-08T00:00:00Z',
        credit_id: 'credit-uuid-1',
        transaction_type: 'payment',
        debit_amount: 0,
        credit_amount: 0,
        description: 'No payment on this day',
        effective_date: '2024-01-08',
        date_status: 'start'
    },
    {
        created_at: '2024-01-09T00:00:00Z',
        credit_id: 'credit-uuid-1',
        transaction_type: 'payment',
        debit_amount: 0,
        credit_amount: 0,
        description: 'No payment on this day',
        effective_date: '2024-01-09',
        date_status: null
    },
    {
        created_at: '2024-01-10T00:00:00Z',
        credit_id: 'credit-uuid-1',
        transaction_type: 'payment',
        debit_amount: 50000,
        credit_amount: 0,
        description: 'Payment for period end',
        effective_date: '2024-01-10',
        date_status: 'end'
    }
];

// params:
// - Loan start date: Ngày bắt đầu của HĐ
// - Loan end date: Ngày kết thúc của HĐ
// - Payment period: Kỳ thanh toán
// - History data: Dữ liệu lịch sử
// - Payment history data: Dữ liệu thanh toán lãi
export const convertFromHistoryToTimeArray = (loanStartDate: string, loanEndDate: string, paymentPeriod: number, historyData: any[], payment_history_data: any[]) => {
    const result: [string, string][] = [];
    
    // Sắp xếp payment_history_data theo effective_date
    const sortedHistory = [...payment_history_data].sort((a, b) => 
        new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime()
    );
    
    // Xử lý các kỳ trong payment history
    let i = 0;
    while (i < sortedHistory.length) {
        const current = sortedHistory[i];
        
        if (current.date_status === 'start') {
            // Tìm ngày end tương ứng
            let endIndex = i + 1;
            while (endIndex < sortedHistory.length && sortedHistory[endIndex].date_status !== 'end') {
                endIndex++;
            }
            
            if (endIndex < sortedHistory.length) {
                result.push([current.effective_date, sortedHistory[endIndex].effective_date]);
                i = endIndex + 1;
            } else {
                // Nếu không tìm thấy end, chỉ lấy ngày start
                result.push([current.effective_date, current.effective_date]);
                i++;
            }
        } else if (current.date_status === 'only') {
            result.push([current.effective_date, current.effective_date]);
            i++;
        } else {
            i++;
        }
    }
    
    // Tìm ngày bắt đầu cho việc chia kỳ tiếp theo
    let nextPeriodStartDate: string;
    
    if (sortedHistory.length > 0) {
        // Nếu có payment history, bắt đầu từ ngày sau ngày cuối cùng
        const lastPaymentDate = sortedHistory[sortedHistory.length - 1].effective_date;
        const lastDate = new Date(lastPaymentDate);
        lastDate.setDate(lastDate.getDate() + 1);
        nextPeriodStartDate = formatDate(lastDate);
    } else {
        // Nếu không có payment history, bắt đầu từ loanStartDate
        nextPeriodStartDate = loanStartDate;
    }
    
    // Tạo các kỳ cho phần còn lại theo paymentPeriod
    const endDate = new Date(loanEndDate);
    let currentStart = new Date(nextPeriodStartDate);
    
    while (currentStart <= endDate) {
        let currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + paymentPeriod - 1);
        
        // Nếu ngày kết thúc vượt quá ngày kết thúc loan, điều chỉnh
        if (currentEnd > endDate) {
            currentEnd = new Date(endDate);
        }
        
        // Chỉ thêm nếu ngày bắt đầu <= ngày kết thúc
        if (currentStart <= endDate) {
            result.push([
                formatDate(currentStart),
                formatDate(currentEnd)
            ]);
        }
        
        // Di chuyển đến kỳ tiếp theo
        currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() + 1);
    }
    
    return result;
};

// Helper function để format ngày theo định dạng YYYY-MM-DD
const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

/**
 * Trả về mảng trạng thái checked/unchecked tương ứng với convertFromHistoryToTimeArray
 * @param loanStartDate - Ngày bắt đầu của HĐ
 * @param loanEndDate - Ngày kết thúc của HĐ
 * @param paymentPeriod - Kỳ thanh toán
 * @param historyData - Dữ liệu lịch sử
 * @param payment_history_data - Dữ liệu thanh toán lãi
 * @returns boolean[] - Mảng trạng thái: true = checked (có trong DB), false = unchecked (generated)
 */
export const convertFromHistoryToStatusArray = (
    loanStartDate: string, 
    loanEndDate: string, 
    paymentPeriod: number, 
    historyData: any[], 
    payment_history_data: any[]
): boolean[] => {
    const result: boolean[] = [];
    
    // Sắp xếp payment_history_data theo effective_date
    const sortedHistory = [...payment_history_data].sort((a, b) => 
        new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime()
    );
    
    // Xử lý các kỳ trong payment history - những kỳ này đã checked
    let i = 0;
    while (i < sortedHistory.length) {
        const current = sortedHistory[i];
        
        if (current.date_status === 'start') {
            // Tìm ngày end tương ứng
            let endIndex = i + 1;
            while (endIndex < sortedHistory.length && sortedHistory[endIndex].date_status !== 'end') {
                endIndex++;
            }
            
            if (endIndex < sortedHistory.length) {
                result.push(true); // Đã checked
                i = endIndex + 1;
            } else {
                result.push(true); // Đã checked
                i++;
            }
        } else if (current.date_status === 'only') {
            result.push(true); // Đã checked
            i++;
        } else {
            i++;
        }
    }
    
    // Tìm ngày bắt đầu cho việc chia kỳ tiếp theo
    let nextPeriodStartDate: string;
    
    if (sortedHistory.length > 0) {
        // Nếu có payment history, bắt đầu từ ngày sau ngày cuối cùng
        const lastPaymentDate = sortedHistory[sortedHistory.length - 1].effective_date;
        const lastDate = new Date(lastPaymentDate);
        lastDate.setDate(lastDate.getDate() + 1);
        nextPeriodStartDate = formatDate(lastDate);
    } else {
        // Nếu không có payment history, bắt đầu từ loanStartDate
        nextPeriodStartDate = loanStartDate;
    }
    
    // Tạo các kỳ cho phần còn lại theo paymentPeriod - những kỳ này chưa checked
    const endDate = new Date(loanEndDate);
    let currentStart = new Date(nextPeriodStartDate);
    
    while (currentStart <= endDate) {
        let currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + paymentPeriod - 1);
        
        // Nếu ngày kết thúc vượt quá ngày kết thúc loan, điều chỉnh
        if (currentEnd > endDate) {
            currentEnd = new Date(endDate);
        }
        
        // Chỉ thêm nếu ngày bắt đầu <= ngày kết thúc
        if (currentStart <= endDate) {
            result.push(false); // Chưa checked
        }
        
        // Di chuyển đến kỳ tiếp theo
        currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() + 1);
    }
    
    return result;
};

/**
 * Trả về cả time periods và status array
 * @param loanStartDate - Ngày bắt đầu của HĐ
 * @param loanEndDate - Ngày kết thúc của HĐ
 * @param paymentPeriod - Kỳ thanh toán
 * @param historyData - Dữ liệu lịch sử
 * @param payment_history_data - Dữ liệu thanh toán lãi
 * @returns {periods: [string, string][], statuses: boolean[]}
 */
export const convertFromHistoryToTimeArrayWithStatus = (
    loanStartDate: string, 
    loanEndDate: string, 
    paymentPeriod: number, 
    historyData: any[], 
    payment_history_data: any[]
): { periods: [string, string][], statuses: boolean[] } => {
    const periods = convertFromHistoryToTimeArray(loanStartDate, loanEndDate, paymentPeriod, historyData, payment_history_data);
    const statuses = convertFromHistoryToStatusArray(loanStartDate, loanEndDate, paymentPeriod, historyData, payment_history_data);
    
    return { periods, statuses };
};

// Updated Test Cases
export const runTestCases = () => {
    console.log('=== Running Test Cases ===\n');

    // Test Case 1: Basic case với start-end pairs và only
    console.log('Test Case 1: Basic case với mockData');
    const test1 = convertFromHistoryToTimeArray(
        '2024-01-04',
        '2024-01-20',
        5,
        mockData,
        mockData
    );
    const status1 = convertFromHistoryToStatusArray(
        '2024-01-04',
        '2024-01-20',
        5,
        mockData,
        mockData
    );
    console.log('Time periods:', test1);
    console.log('Statuses:', status1);
    console.log('Expected statuses: [true, true, true, false, false] (first 3 from payment history, last 2 generated)');
    console.log('--------------------------------');

    // Test Case 2: Combined function
    console.log('Test Case 2: Combined function');
    const combined = convertFromHistoryToTimeArrayWithStatus(
        '2024-01-04',
        '2024-01-20',
        5,
        mockData,
        mockData
    );
    console.log('Combined result:', combined);
    console.log('Periods count:', combined.periods.length);
    console.log('Statuses count:', combined.statuses.length);
    console.log('Lengths match:', combined.periods.length === combined.statuses.length);
    console.log('--------------------------------');

    // Test Case 3: No payment history
    console.log('Test Case 3: No payment history');
    const test3 = convertFromHistoryToStatusArray(
        '2024-01-01',
        '2024-01-15',
        3,
        [],
        []
    );
    console.log('Statuses (no payment history):', test3);
    console.log('Expected: All false (all generated)');
    console.log('--------------------------------');

    console.log('\n=== Test Cases Completed ===');
};

