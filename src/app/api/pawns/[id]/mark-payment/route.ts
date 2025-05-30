import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Create admin client for server-side operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: pawnId } = await params;
    const body = await request.json();
    const { periods, action } = body; // periods: array of period objects, action: 'mark' | 'unmark'

    if (!pawnId || !periods || !Array.isArray(periods) || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: pawnId, periods, action' },
        { status: 400 }
      );
    }

    // Start a transaction
    const { data: transactionResult, error: transactionError } = await supabaseAdmin.rpc(
      'handle_pawn_payment_marking',
      {
        p_pawn_id: pawnId,
        p_periods: periods,
        p_action: action
      }
    );

    if (transactionError) {
      console.error('Transaction error:', transactionError);
      return NextResponse.json(
        { error: transactionError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: transactionResult 
    });

  } catch (error) {
    console.error('Error in pawn mark-payment API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 