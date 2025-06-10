import { InstallmentContractClient } from "./InstallmentContractClient";

interface InstallmentContractPageProps {
  params: Promise<{ contractCode: string }>;
}

export default async function InstallmentContractPage({ params }: InstallmentContractPageProps) {
  const { contractCode } = await params;
  
  return <InstallmentContractClient contractCode={contractCode} />;
} 