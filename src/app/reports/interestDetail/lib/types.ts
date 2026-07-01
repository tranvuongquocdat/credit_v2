export interface InterestDetailItem {
  id: string;
  contractId: string;
  contractCode: string;
  customerName: string;
  itemName: string;
  loanAmount: number;
  transactionDate: string;
  transactionDateTime: string;
  interestAmount: number;
  otherAmount: number;
  totalAmount: number;
  transactionType: string;
  type: 'Cầm đồ' | 'Tín chấp' | 'Trả góp';
}
