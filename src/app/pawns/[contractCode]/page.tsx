// Server Component - handles async params
type PageProps = {
  params: Promise<{ contractCode: string }>;
};

export default async function PawnContractPage({ params }: PageProps) {
  const { contractCode } = await params;
  
  // Import and render the client component
  const { PawnContractClient } = await import('./PawnContractClient');
  return <PawnContractClient contractCode={contractCode} />;
} 