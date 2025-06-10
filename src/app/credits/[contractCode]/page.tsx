// Server Component - handles async params
type PageProps = {
  params: Promise<{ contractCode: string }>;
};

export default async function CreditContractPage({ params }: PageProps) {
  const { contractCode } = await params;
  
  // Import and render the client component
  const { CreditContractClient } = await import('./CreditContractClient');
  return <CreditContractClient contractCode={contractCode} />;
} 