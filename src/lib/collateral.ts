import { supabase } from './supabase';
import { Collateral, CollateralInsert, CollateralUpdate, CollateralWithStore } from '@/models/collateral';

// Get all collaterals with optional filtering
export async function getCollaterals(filters?: {
  category?: string;
  status?: string;
  storeId?: string;
}) {
  try {
    let query = supabase
      .from('collaterals')
      .select(`
        *,
        store:stores(id, name)
      `)
      .order('created_at', { ascending: false });

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.storeId) {
      query = query.eq('store_id', filters.storeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching collaterals:', error);
      return { data: null, error };
    }

    return { data: data as CollateralWithStore[], error: null };
  } catch (error) {
    console.error('Error in getCollaterals:', error);
    return { data: null, error };
  }
}

// Get collateral by ID
export async function getCollateralById(id: string) {
  try {
    const { data, error } = await supabase
      .from('collaterals')
      .select(`
        *,
        store:stores(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching collateral:', error);
      return { data: null, error };
    }

    return { data: data as CollateralWithStore, error: null };
  } catch (error) {
    console.error('Error in getCollateralById:', error);
    return { data: null, error };
  }
}

// Create new collateral
export async function createCollateral(collateral: CollateralInsert) {
  try {
    const { data, error } = await supabase
      .from('collaterals')
      .insert(collateral)
      .select()
      .single();

    if (error) {
      console.error('Error creating collateral:', error);
      return { data: null, error };
    }

    return { data: data as Collateral, error: null };
  } catch (error) {
    console.error('Error in createCollateral:', error);
    return { data: null, error };
  }
}

// Update collateral
export async function updateCollateral(id: string, updates: CollateralUpdate) {
  try {
    const { data, error } = await supabase
      .from('collaterals')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating collateral:', error);
      return { data: null, error };
    }

    return { data: data as Collateral, error: null };
  } catch (error) {
    console.error('Error in updateCollateral:', error);
    return { data: null, error };
  }
}

// Delete collateral
export async function deleteCollateral(id: string) {
  try {
    const { error } = await supabase
      .from('collaterals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting collateral:', error);
      return { error };
    }

    return { error: null };
  } catch (error) {
    console.error('Error in deleteCollateral:', error);
    return { error };
  }
}

// Get collaterals by store
export async function getCollateralsByStore(storeId: string) {
  try {
    const { data, error } = await supabase
      .from('collaterals')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .order('name');

    if (error) {
      console.error('Error fetching collaterals by store:', error);
      return { data: null, error };
    }

    return { data: data as Collateral[], error: null };
  } catch (error) {
    console.error('Error in getCollateralsByStore:', error);
    return { data: null, error };
  }
}

// Check if collateral code exists
export async function checkCollateralCodeExists(code: string, excludeId?: string) {
  try {
    let query = supabase
      .from('collaterals')
      .select('id')
      .eq('code', code);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking collateral code:', error);
      return { exists: false, error };
    }

    return { exists: data && data.length > 0, error: null };
  } catch (error) {
    console.error('Error in checkCollateralCodeExists:', error);
    return { exists: false, error };
  }
} 